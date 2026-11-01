import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';

// Notificações e auditoria.
export function admin(app: FastifyInstance) {
  // Só no modo local (docker-compose.local.yml). A app encerra; o atalho "VL Command" lê na auditoria
  // qual botão foi clicado ("POST /api/sistema/desligar" ou ".../reiniciar") e desliga ou religa tudo.
  for (const pedido of ['desligar', 'reiniciar']) {
    app.post(`/api/sistema/${pedido}`, async (_req, rep) => {
      if (process.env.PERMITIR_DESLIGAR !== '1') return rep.code(404).send({ erro: 'não encontrado' });
      setTimeout(() => process.exit(0), 1000); // tempo para responder e gravar a auditoria
      return { ok: true };
    });
  }

  app.get('/api/notificacoes', () => q('select * from notificacao order by criado_em desc limit 200'));
  app.post<{ Params: { id: string } }>('/api/notificacoes/:id/lida', async (req) => {
    await q('update notificacao set lida_em = now() where id = $1 and lida_em is null', [req.params.id]);
    return { ok: true };
  });
  app.post('/api/notificacoes/lidas', async () => {
    await q('update notificacao set lida_em = now() where lida_em is null');
    return { ok: true };
  });

  app.get<{ Querystring: { busca?: string } }>('/api/auditoria', (req) => q(
    `select * from log_auditoria where $1::text is null
       or acao ilike '%' || $1 || '%' or entidade ilike '%' || $1 || '%' or autor_id ilike '%' || $1 || '%' or contexto::text ilike '%' || $1 || '%'
     order by id desc limit 500`, [req.query.busca || null]));
}
