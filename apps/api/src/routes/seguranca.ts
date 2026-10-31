import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { novoToken, sha256 } from '../crypto.ts';

export function seguranca(app: FastifyInstance) {
  app.get<{ Querystring: { sistema_id?: string; status?: string } }>('/api/seguranca/eventos', (req) => q(
    `select e.*, host(e.ip_origem) as ip, s.nome as sistema_nome, c.nome as cliente_nome from evento_seguranca e
     join sistema s on s.id = e.sistema_id join cliente c on c.id = s.cliente_id
     where ($1::uuid is null or e.sistema_id = $1) and ($2::text is null or e.status = $2)
     order by e.detectado_em desc limit 300`, [req.query.sistema_id || null, req.query.status || null]));

  app.patch<{ Params: { id: string }; Body: { status: string } }>('/api/seguranca/eventos/:id', {
    schema: { body: { type: 'object', required: ['status'], properties: { status: { enum: ['aberto', 'reconhecido', 'resolvido', 'falso_positivo'] } } } },
  }, async (req, rep) => (await q('update evento_seguranca set status = $2 where id = $1 returning *', [req.params.id, req.body.status]))[0]
    ?? rep.code(404).send({ erro: 'não encontrado' }));

  app.get('/api/seguranca/bloqueios', () => q(`select b.*, host(b.ip) as ip, s.nome as sistema_nome from bloqueio_ip b
    join sistema s on s.id = b.sistema_id order by (b.removido_em is null) desc, b.criado_em desc limit 200`));

  // Gera a chave que o sistema do cliente usa para enviar eventos. Mostrada uma única vez.
  app.post<{ Params: { id: string } }>('/api/sistemas/:id/chave-ingestao', async (req, rep) => {
    const chave = `vlc_${novoToken()}`;
    const [s] = await q('update sistema set chave_ingestao_hash = $2 where id = $1 returning id', [req.params.id, sha256(chave)]);
    return s ? { chave } : rep.code(404).send({ erro: 'sistema não encontrado' });
  });
}
