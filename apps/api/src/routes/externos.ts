import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { iguais } from '../crypto.ts';
import { notificar } from '../notificar.ts';
import { registrar } from '../auditoria.ts';

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
        await notificar('pagamento', 'info', `Pagamento recebido: ${f.nome} — ${(f.valor_cent / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, '/faturas');
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
}
