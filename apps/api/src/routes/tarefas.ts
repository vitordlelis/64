import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { confereTotp } from '../auth.ts';
import { ACOES, acaoValida } from '../acoes.ts';
import { atualizarEstado } from '../agentes/agentes.ts';

const uuid = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } };

export function tarefas(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string } }>('/api/tarefas', (req) => q(
    `select t.*, a.nome as agente_nome, a.funcao as agente_funcao, s.nome as sistema_nome,
       (select count(*)::int from envio_mensagem e where e.tarefa_id = t.id) as envios
     from tarefa t left join agente a on a.id = t.agente_id left join sistema s on s.id = t.sistema_id
     where ($1::text is null or t.status = $1) order by (t.status = 'aguardando') desc, t.criada_em desc limit 200`, [req.query.status || null]));

  app.get<{ Params: { id: string } }>('/api/tarefas/:id', { schema: { params: uuid } }, async (req, rep) => {
    const [t] = await q('select t.*, a.nome as agente_nome from tarefa t left join agente a on a.id = t.agente_id where t.id = $1', [req.params.id]);
    if (!t) return rep.code(404).send({ erro: 'não encontrada' });
    const envios = await q(`select e.id, e.destino, e.canal, e.conteudo, e.status, e.erro, c.nome as cliente_nome
      from envio_mensagem e join cliente c on c.id = e.cliente_id where e.tarefa_id = $1 order by c.nome limit 500`, [t.id]);
    return { ...t, envios };
  });

  app.post<{ Params: { id: string }; Body: { codigo?: string } }>('/api/tarefas/:id/aprovar', {
    schema: { params: uuid, body: { type: ['object', 'null'], properties: { codigo: { type: 'string' } } } },
  }, async (req, rep) => {
    const [t] = await q("select * from tarefa where id = $1 and status = 'aguardando' and expira_em > now()", [req.params.id]);
    if (!t) return rep.code(409).send({ erro: 'tarefa não está aguardando aprovação (ou expirou)' });
    if (t.impacto === 'alto' && !(await confereTotp(req.adminId!, req.body?.codigo))) return rep.code(403).send({ erro: 'Ação de alto impacto: informe o código do autenticador' });
    // recomendação sem ação: aprovar = "ciente/feito", não há nada para o Executor
    const [r] = await q(`update tarefa set status = case when acao_tipo is null then 'concluida' else 'aprovada' end, aprovada_por = $2, decidida_em = now()
      where id = $1 and status = 'aguardando' returning *`, [t.id, req.adminId]);
    if (r.agente_id) await atualizarEstado(r.agente_id);
    return r;
  });

  app.post<{ Params: { id: string }; Body: { motivo?: string } }>('/api/tarefas/:id/rejeitar', {
    schema: { params: uuid, body: { type: ['object', 'null'], properties: { motivo: { type: 'string', maxLength: 500 } } } },
  }, async (req, rep) => {
    const [t] = await q(`update tarefa set status = 'rejeitada', decidida_em = now(), motivo_rejeicao = $2
      where id = $1 and status = 'aguardando' returning *`, [req.params.id, req.body?.motivo ?? null]);
    if (!t) return rep.code(409).send({ erro: 'tarefa não está aguardando aprovação' });
    await q("update envio_mensagem set status = 'cancelada', atualizado_em = now() where tarefa_id = $1 and status = 'pendente'", [t.id]);
    if (t.agente_id) await atualizarEstado(t.agente_id);
    return t;
  });

  // Ação iniciada pelo próprio admin: ele é o autor e o aprovador (com 2FA se for de alto impacto).
  app.post<{ Body: { acao_tipo: string; acao_payload: Record<string, unknown>; titulo: string; descricao?: string; sistema_id?: string; codigo?: string } }>('/api/tarefas', {
    schema: { body: { type: 'object', required: ['acao_tipo', 'acao_payload', 'titulo'], properties: {
      acao_tipo: { type: 'string' }, acao_payload: { type: 'object' }, titulo: { type: 'string', maxLength: 200 },
      descricao: { type: 'string', maxLength: 2000 }, sistema_id: { type: 'string', format: 'uuid' }, codigo: { type: 'string' },
    } } },
  }, async (req, rep) => {
    const b = req.body;
    if (b.acao_tipo === 'enviar_mensagens' || !acaoValida(b.acao_tipo, b.acao_payload)) return rep.code(400).send({ erro: 'ação ou parâmetros inválidos' });
    const impacto = ACOES[b.acao_tipo].impacto;
    if (impacto === 'alto' && !(await confereTotp(req.adminId!, b.codigo))) return rep.code(403).send({ erro: 'Ação de alto impacto: informe o código do autenticador' });
    return rep.code(201).send((await q(`insert into tarefa (sistema_id, origem, titulo, descricao, acao_tipo, acao_payload, impacto, status, aprovada_por, decidida_em)
      values ($1, 'admin_texto', $2, $3, $4, $5, $6, 'aprovada', $7, now()) returning *`,
      [b.sistema_id ?? null, b.titulo, b.descricao ?? 'Ação iniciada pelo administrador.', b.acao_tipo, b.acao_payload, impacto, req.adminId]))[0]);
  });
}

export async function expirarTarefas() {
  const vencidas = await q("update tarefa set status = 'expirada' where status = 'aguardando' and expira_em < now() returning id");
  if (vencidas.length) await q("update envio_mensagem set status = 'cancelada' where tarefa_id = any($1) and status = 'pendente'", [vencidas.map((t) => t.id)]);
}
