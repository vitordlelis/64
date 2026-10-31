import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { prepararLote, renderizar, DEST_MANUAL, type Destinatario } from '../mensagens.ts';
import { brl } from '../util.ts';

export function mensagens(app: FastifyInstance) {
  app.post<{ Body: { modelo_id: string; cliente_id: string } }>('/api/mensagens/previa', {
    schema: { body: { type: 'object', required: ['modelo_id', 'cliente_id'], properties: { modelo_id: { type: 'string', format: 'uuid' }, cliente_id: { type: 'string', format: 'uuid' } } } },
  }, async (req, rep) => {
    const [m] = await q('select * from modelo_mensagem where id = $1', [req.body.modelo_id]);
    const [d] = await q<Destinatario>(DEST_MANUAL, [[req.body.cliente_id]]);
    if (!m || !d) return rep.code(404).send({ erro: 'modelo ou cliente não encontrado' });
    const v = { nome_cliente: d.nome_cliente, valor: d.valor_cent != null ? brl(d.valor_cent) : undefined,
      data_vencimento: d.data?.split('-').reverse().join('/'), nome_sistema: d.nome_sistema ?? undefined, link_pagamento: d.link_pagamento ?? undefined };
    return { assunto: m.assunto && renderizar(m.assunto, v), texto: renderizar(m.corpo, v) };
  });

  app.post<{ Body: { modelo_id: string; cliente_ids: string[] } }>('/api/mensagens/disparo', {
    schema: { body: { type: 'object', required: ['modelo_id', 'cliente_ids'], properties: {
      modelo_id: { type: 'string', format: 'uuid' }, cliente_ids: { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'string', format: 'uuid' } },
    } } },
  }, async (req, rep) => {
    const [m] = await q('select * from modelo_mensagem where id = $1', [req.body.modelo_id]);
    if (!m) return rep.code(404).send({ erro: 'modelo não encontrado' });
    // disparo manual sempre passa pela tela de Aprovações (pré-visualização do lote)
    const lote = await prepararLote({ ...m, exige_confirmacao: true }, await q(DEST_MANUAL, [req.body.cliente_ids]), 'admin_texto', req.adminId!);
    return lote ?? rep.code(422).send({ erro: 'Nenhum destinatário válido (sem e-mail/WhatsApp, opt-out ou já enviado).' });
  });

  app.get<{ Querystring: { status?: string; cliente_id?: string } }>('/api/envios', (req) => q(
    `select e.*, c.nome as cliente_nome, m.nome as modelo_nome from envio_mensagem e
     join cliente c on c.id = e.cliente_id left join modelo_mensagem m on m.id = e.modelo_id
     where ($1::text is null or e.status = $1) and ($2::uuid is null or e.cliente_id = $2)
     order by e.criado_em desc limit 500`, [req.query.status || null, req.query.cliente_id || null]));
}
