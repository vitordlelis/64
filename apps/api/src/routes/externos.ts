import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { createHmac } from 'node:crypto';
import { iguais, sha256 } from '../crypto.ts';
import { notificar } from '../notificar.ts';
import { registrar } from '../auditoria.ts';
import { brl } from '../util.ts';

// Rotas chamadas por máquinas (sem sessão de admin): webhook do Asaas e sonda externa de uptime.
export function externos(app: FastifyInstance) {
  app.post<{ Body: { event?: string; payment?: { id?: string } } }>('/api/webhooks/asaas', async (req, rep) => {
    const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
    const recebido = req.headers['asaas-access-token'];
    if (!esperado || typeof recebido !== 'string' || !iguais(recebido, esperado)) return rep.code(401).send({ erro: 'token inválido' });
    const { event, payment } = req.body ?? {};
    if ((event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') && payment?.id) {
      const [f] = await q(`update fatura f set status = 'paga', pago_em = now() from cliente c
        where f.gateway_id = $1 and f.status <> 'paga' and c.id = f.cliente_id returning f.id, f.valor_cent, c.nome`, [payment.id]);
      if (f) {
        await registrar({ autor_tipo: 'webhook', autor_id: 'asaas', acao: 'fatura_paga', entidade: 'fatura', entidade_id: f.id, contexto: { event } });
        await notificar('pagamento', 'info', `Pagamento recebido: ${f.nome} — ${brl(f.valor_cent)}`, '/faturas');
      }
    }
    return { ok: true }; // 200 sempre para o Asaas não pausar a fila de webhooks
  });

  app.register(async (sonda) => {
    sonda.addHook('onRequest', async (req, rep) => {
      const t = process.env.SONDA_TOKEN;
      const h = req.headers.authorization?.replace(/^Bearer /, '');
      if (!t || !h || !iguais(h, t)) return rep.code(401).send({ erro: 'token inválido' });
    });
    sonda.get('/api/sonda/alvos', () => q("select s.id, coalesce(s.health_url, s.url) as url from sistema s join cliente c on c.id = s.cliente_id where c.status = 'ativo'"));
    sonda.post<{ Body: { sistema_id: string; ok: boolean; http_status: number | null; latencia_ms: number | null; erro: string | null }[] }>('/api/sonda/resultados', {
      schema: { body: { type: 'array', maxItems: 1000, items: { type: 'object', required: ['sistema_id', 'ok'], properties: {
        sistema_id: { type: 'string', format: 'uuid' }, ok: { type: 'boolean' }, http_status: { type: ['integer', 'null'] },
        latencia_ms: { type: ['integer', 'null'] }, erro: { type: ['string', 'null'], maxLength: 500 },
      } } } },
    }, async (req) => {
      for (const r of req.body) {
        await q("insert into check_saude (sistema_id, origem, ok, http_status, latencia_ms, erro) values ($1, 'sonda_externa', $2, $3, $4, $5)",
          [r.sistema_id, r.ok, r.http_status ?? null, r.latencia_ms ?? null, r.erro ?? null]);
      }
      return { ok: true };
    });
  });

  // Eventos de segurança enviados pelos sistemas dos clientes (chave por sistema no cabeçalho x-vlc-chave).
  app.post<{ Body: { tipo: string; ip?: string; caminho?: string; dados?: object; ocorrido_em?: string }[] }>('/api/ingest/eventos', {
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    schema: { body: { type: 'array', maxItems: 1000, items: { type: 'object', required: ['tipo'], properties: {
      tipo: { enum: ['login_falho', 'http_4xx', 'http_5xx', 'req'] }, ip: { type: 'string', maxLength: 45 },
      caminho: { type: 'string', maxLength: 500 }, dados: { type: 'object' }, ocorrido_em: { type: 'string', format: 'date-time' },
    } } } },
  }, async (req, rep) => {
    const chave = req.headers['x-vlc-chave'];
    const [s] = typeof chave === 'string' ? await q('select id from sistema where chave_ingestao_hash = $1', [sha256(chave)]) : [];
    if (!s) return rep.code(401).send({ erro: 'chave inválida' });
    try {
      await q(`insert into evento_bruto (sistema_id, tipo, ip, caminho, dados, ocorrido_em)
        select $1, e->>'tipo', (e->>'ip')::inet, e->>'caminho', coalesce(e->'dados', '{}'), coalesce((e->>'ocorrido_em')::timestamptz, now())
        from jsonb_array_elements($2::jsonb) e`, [s.id, JSON.stringify(req.body)]);
    } catch (e) {
      if ((e as { code?: string }).code === '22P02') return rep.code(400).send({ erro: 'IP inválido em algum evento' });
      throw e;
    }
    return { recebidos: req.body.length };
  });

  // WhatsApp Cloud API: verificação do webhook, status das mensagens e opt-out ("SAIR").
  app.get<{ Querystring: Record<string, string> }>('/api/webhooks/whatsapp', (req, rep) => {
    const t = process.env.WHATSAPP_VERIFY_TOKEN;
    if (t && req.query['hub.mode'] === 'subscribe' && iguais(req.query['hub.verify_token'] ?? '', t)) return rep.send(req.query['hub.challenge']);
    return rep.code(403).send();
  });
  app.register(async (wa) => {
    wa.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, corpo, pronto) => {
      (req as unknown as { cru: Buffer }).cru = corpo as Buffer;
      try { pronto(null, JSON.parse(String(corpo))); } catch (e) { pronto(e as Error); }
    });
    wa.post('/api/webhooks/whatsapp', async (req, rep) => {
      const segredo = process.env.WHATSAPP_APP_SECRET;
      const assinatura = String(req.headers['x-hub-signature-256'] ?? '');
      const esperado = segredo && 'sha256=' + createHmac('sha256', segredo).update((req as unknown as { cru: Buffer }).cru).digest('hex');
      if (!esperado || !iguais(assinatura, esperado)) return rep.code(401).send();
      type Valor = { statuses?: { id: string; status: string; errors?: { title?: string }[] }[]; messages?: { from: string; text?: { body?: string } }[] };
      const valores: Valor[] = ((req.body as { entry?: { changes?: { value: Valor }[] }[] }).entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value));
      const MAPA: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };
      for (const v of valores) {
        for (const st of v.statuses ?? []) {
          if (MAPA[st.status]) await q('update envio_mensagem set status = $2, erro = $3, atualizado_em = now() where provedor_id = $1',
            [st.id, MAPA[st.status], st.errors?.[0]?.title ?? null]);
        }
        for (const m of v.messages ?? []) {
          if (/^\s*(sair|parar|pare|stop|cancelar)\s*$/i.test(m.text?.body ?? '')) {
            await q("update cliente set optout_whatsapp = true where regexp_replace(whatsapp, '\\D', '', 'g') = $1", [m.from]);
          }
        }
      }
      return { ok: true };
    });
  });
}
