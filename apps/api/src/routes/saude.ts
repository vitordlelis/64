import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { checarAgora } from '../jobs/uptime.ts';

const UPTIME = (intervalo: string) => `(select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2)
  from check_saude c where c.sistema_id = s.id and c.origem = 'principal' and c.checado_em > now() - interval '${intervalo}')`;

export function saude(app: FastifyInstance) {
  app.get('/api/saude', async () => ({
    sistemas: await q(`select s.id, s.nome, s.url, s.status_saude, s.cliente_id, c.nome as cliente_nome, ${UPTIME('24 hours')} as uptime_24h,
        (select latencia_ms from check_saude c where c.sistema_id = s.id order by checado_em desc limit 1) as latencia_ms
      from sistema s join cliente c on c.id = s.cliente_id where c.status = 'ativo' order by c.nome, s.nome`),
    incidentes: await q(`select i.*, s.nome as sistema_nome from incidente i join sistema s on s.id = i.sistema_id
      order by (i.fim_em is null) desc, i.inicio_em desc limit 100`),
  }));

  // Latência média de todos os sistemas em blocos de 10 min, últimas 6 h (gráfico da Visão geral).
  app.get('/api/saude/latencia', () => q(`select extract(epoch from date_trunc('hour', checado_em) + floor(extract(minute from checado_em) / 10) * interval '10 minutes')::bigint * 1000 as t,
      round(avg(latencia_ms))::int as ms
    from check_saude where origem = 'principal' and ok and latencia_ms is not null and checado_em > now() - interval '6 hours'
    group by 1 order by 1`));

  // As 3 ligações de um sistema com o VL Command: site no ar, código no GitHub e eventos de segurança.
  app.get<{ Params: { id: string } }>('/api/sistemas/:id/conexoes', async (req, rep) => {
    const [c] = await q(`select s.url, s.github_repo, s.github_atualizado_em, s.github_status->>'erro' as github_erro,
        s.chave_ingestao_hash is not null as chave_gerada,
        exists (select 1 from integracao where nome = 'github') as github_conectado,
        (select row_to_json(k) from (select ok, checado_em, erro, latencia_ms, http_status from check_saude
           where sistema_id = s.id and origem = 'principal' order by checado_em desc limit 1) k) as ultimo_check,
        (select max(ocorrido_em) from evento_bruto where sistema_id = s.id) as ultimo_evento
      from sistema s where s.id = $1`, [req.params.id]);
    return c ?? rep.code(404).send({ erro: 'não encontrado' });
  });

  app.post<{ Params: { id: string } }>('/api/sistemas/:id/checar', async (req) => {
    await checarAgora(req.params.id);
    return (await q("select ok, checado_em, erro, latencia_ms, http_status from check_saude where sistema_id = $1 and origem = 'principal' order by checado_em desc limit 1", [req.params.id]))[0] ?? null;
  });

  app.get<{ Params: { id: string } }>('/api/sistemas/:id/saude', async (req) => {
    const [u] = await q(`select ${UPTIME('24 hours')} as h24, ${UPTIME('7 days')} as d7, ${UPTIME('30 days')} as d30 from sistema s where s.id = $1`, [req.params.id]);
    return {
      uptime: u,
      checks: await q(`select checado_em, ok, latencia_ms, http_status, erro, origem from check_saude
        where sistema_id = $1 and checado_em > now() - interval '24 hours' order by checado_em`, [req.params.id]),
      incidentes: await q('select * from incidente where sistema_id = $1 order by inicio_em desc limit 50', [req.params.id]),
    };
  });
}
