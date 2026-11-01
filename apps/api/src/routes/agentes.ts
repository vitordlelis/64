import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { q } from '../db.ts';
import { confereTotp } from '../auth.ts';
import { MODELOS, iaConfigurada } from '../agentes/ia.ts';
import { dominioVerificado } from '../pentest.ts';

const uuid = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } };

export function agentes(app: FastifyInstance) {
  app.get('/api/agentes', async () => ({
    ia_configurada: iaConfigurada(),
    agentes: await q(`select a.*, t.titulo as tarefa_atual,
        (select coalesce(sum(custo_usd), 0) from atividade_agente x where x.agente_id = a.id and x.criado_em >= date_trunc('day', now())) as custo_hoje_usd,
        (select count(*)::int from tarefa p where p.agente_id = a.id and p.status = 'aguardando') as aguardando,
        (select count(*)::int from tarefa p where p.agente_id = a.id and p.status = 'rascunho') as na_fila,
        (select row_to_json(x) from (select resumo, erro, criado_em from atividade_agente x where x.agente_id = a.id order by id desc limit 1) x) as ultima
      from agente a left join tarefa t on t.id = a.tarefa_atual_id
      order by array_position(array['diretor','marketing','designer','engenheiro','soc','pentester'], a.funcao)`),
  }));

  app.get<{ Params: { id: string } }>('/api/agentes/:id/atividades', { schema: { params: uuid } },
    (req) => q('select * from atividade_agente where agente_id = $1 order by id desc limit 50', [req.params.id]));

  app.patch<{ Params: { id: string }; Body: { ativo?: boolean; modelo?: string; teto_custo_dia_cent?: number } }>('/api/agentes/:id', {
    schema: { params: uuid, body: { type: 'object', minProperties: 1, additionalProperties: false, properties: {
      ativo: { type: 'boolean' }, modelo: { enum: [...MODELOS] }, teto_custo_dia_cent: { type: 'integer', minimum: 0, maximum: 100_000 },
    } } },
  }, async (req, rep) => {
    const ks = Object.keys(req.body);
    const [a] = await q(`update agente set ${ks.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`, [req.params.id, ...Object.values(req.body)]);
    return a ?? rep.code(404).send({ erro: 'não encontrado' });
  });

  // Pedido em texto (ou voz) para um agente. O agente responde com análise e, se for o caso, propostas para aprovação.
  app.post<{ Params: { id: string }; Body: { texto: string; voz?: boolean } }>('/api/agentes/:id/comando', {
    schema: { params: uuid, body: { type: 'object', required: ['texto'], properties: { texto: { type: 'string', minLength: 2, maxLength: 2000 }, voz: { type: 'boolean' } } } },
  }, async (req, rep) => {
    const [a] = await q('select id, nome, funcao, ativo from agente where id = $1', [req.params.id]);
    if (!a) return rep.code(404).send({ erro: 'agente não encontrado' });
    if (a.funcao === 'pentester') return rep.code(400).send({ erro: 'A Sentinela só trabalha com pen tests autorizados (botão na página do sistema).' });
    if (!a.ativo) return rep.code(409).send({ erro: `${a.nome} está pausado(a).` });
    if (!iaConfigurada()) return rep.code(409).send({ erro: 'Os agentes precisam da chave ANTHROPIC_API_KEY no arquivo .env.' });
    return rep.code(201).send((await q(`insert into tarefa (agente_id, origem, titulo, descricao, status) values ($1, $2, $3, $4, 'rascunho') returning *`,
      [a.id, req.body.voz ? 'admin_voz' : 'admin_texto', `Pedido para ${a.nome}`, req.body.texto]))[0]);
  });

  app.get<{ Params: { id: string } }>('/api/tarefas/:id/resposta', { schema: { params: uuid } },
    async (req) => (await q('select status, resultado from tarefa where id = $1', [req.params.id]))[0] ?? null);

  // ---------- pen test ----------
  app.post<{ Params: { id: string } }>('/api/sistemas/:id/verificacao', { schema: { params: uuid } }, async (req, rep) => {
    const [s] = await q(`update sistema set token_verificacao = coalesce(token_verificacao, $2) where id = $1 returning url, token_verificacao`, [req.params.id, randomBytes(12).toString('hex')]);
    if (!s) return rep.code(404).send({ erro: 'sistema não encontrado' });
    if (!s.url) return rep.code(409).send({ erro: 'Informe o endereço publicado do sistema primeiro.' });
    return { host: new URL(s.url).hostname, registro: `vl-command-verificacao=${s.token_verificacao}` };
  });

  app.post<{ Params: { id: string } }>('/api/sistemas/:id/verificar', { schema: { params: uuid } }, async (req, rep) => {
    const [s] = await q('select url, token_verificacao from sistema where id = $1', [req.params.id]);
    if (!s?.url) return rep.code(409).send({ erro: 'Informe o endereço publicado do sistema primeiro.' });
    if (!s.token_verificacao) return rep.code(409).send({ erro: 'Gere o registro de verificação primeiro.' });
    if (!(await dominioVerificado(new URL(s.url).hostname, s.token_verificacao))) return rep.code(422).send({ erro: 'Registro TXT não encontrado (a propagação do DNS pode levar alguns minutos).' });
    return (await q('update sistema set dominio_verificado_em = now() where id = $1 returning dominio_verificado_em', [req.params.id]))[0];
  });

  app.post<{ Params: { id: string }; Body: { codigo?: string } }>('/api/sistemas/:id/pentest', { schema: { params: uuid } }, async (req, rep) => {
    const [s] = await q('select id, nome, pentest_autorizado, dominio_verificado_em from sistema where id = $1', [req.params.id]);
    if (!s) return rep.code(404).send({ erro: 'sistema não encontrado' });
    if (!s.pentest_autorizado || !s.dominio_verificado_em) return rep.code(409).send({ erro: 'Autorize o pen test e verifique o domínio antes.' });
    if (!(await confereTotp(req.adminId!, req.body?.codigo))) return rep.code(403).send({ erro: 'Informe o código do autenticador.' });
    return rep.code(201).send((await q(`insert into tarefa (agente_id, sistema_id, origem, titulo, descricao, acao_tipo, acao_payload, impacto, status, aprovada_por, decidida_em)
      values ((select id from agente where funcao = 'pentester'), $1, 'admin_texto', $2, 'Checagens passivas: cabeçalhos, TLS, arquivos expostos, cookies.', 'pentest_passivo', $3, 'alto', 'aprovada', $4, now()) returning *`,
      [s.id, `Pen test passivo em ${s.nome}`, { sistema_id: s.id }, req.adminId]))[0]);
  });

  app.get<{ Params: { id: string } }>('/api/sistemas/:id/pentests', { schema: { params: uuid } },
    (req) => q('select * from relatorio_pentest where sistema_id = $1 order by criado_em desc limit 20', [req.params.id]));
}
