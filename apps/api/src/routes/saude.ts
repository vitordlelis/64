import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';

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
