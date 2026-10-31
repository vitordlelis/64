import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { asaas } from '../asaas.ts';

export function faturas(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string; cliente_id?: string } }>('/api/faturas', async (req) => {
    const { status = null, cliente_id = null } = req.query;
    return q(`select f.*, c.nome as cliente_nome from fatura f join cliente c on c.id = f.cliente_id
              where ($1::text is null or f.status = $1) and ($2::uuid is null or f.cliente_id = $2)
              order by f.vencimento desc limit 500`, [status || null, cliente_id || null]);
  });

  app.post<{ Body: { cliente_id: string; assinatura_id?: string | null; tipo: string; valor_cent: number; vencimento: string } }>('/api/faturas', {
    schema: { body: { type: 'object', required: ['cliente_id', 'tipo', 'valor_cent', 'vencimento'], additionalProperties: false, properties: {
      cliente_id: { type: 'string', format: 'uuid' }, assinatura_id: { type: ['string', 'null'], format: 'uuid' },
      tipo: { enum: ['projeto', 'recorrente'] }, valor_cent: { type: 'integer', minimum: 1 }, vencimento: { type: 'string', format: 'date' },
    } } },
  }, async (req, rep) => {
    const b = req.body;
    try {
      const [f] = await q(`insert into fatura (cliente_id, assinatura_id, tipo, valor_cent, competencia, vencimento)
                           values ($1,$2,$3,$4, date_trunc('month', $5::date), $5) returning *`,
        [b.cliente_id, b.assinatura_id ?? null, b.tipo, b.valor_cent, b.vencimento]);
      return rep.code(201).send(f); // a cobrança no Asaas é criada pelo worker
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return rep.code(409).send({ erro: 'Já existe fatura recorrente desta assinatura neste mês' });
      throw e;
    }
  });

  app.post<{ Params: { id: string } }>('/api/faturas/:id/pagar', async (req, rep) => {
    const [f] = await q("select * from fatura where id = $1 and status in ('aberta','vencida')", [req.params.id]);
    if (!f) return rep.code(409).send({ erro: 'fatura inexistente ou não está em aberto' });
    if (f.gateway_id) await asaas(`/payments/${f.gateway_id}/receiveInCash`, 'POST', { paymentDate: new Date().toISOString().slice(0, 10), value: f.valor_cent / 100 });
    return (await q("update fatura set status = 'paga', pago_em = now() where id = $1 returning *", [f.id]))[0];
  });

  app.post<{ Params: { id: string } }>('/api/faturas/:id/cancelar', async (req, rep) => {
    const [f] = await q("select * from fatura where id = $1 and status in ('aberta','vencida')", [req.params.id]);
    if (!f) return rep.code(409).send({ erro: 'fatura inexistente ou não está em aberto' });
    if (f.gateway_id) await asaas(`/payments/${f.gateway_id}`, 'DELETE'); // sem isso o cliente ainda poderia pagar a cobrança
    return (await q("update fatura set status = 'cancelada' where id = $1 returning *", [f.id]))[0];
  });
}
