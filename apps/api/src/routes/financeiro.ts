import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';

const MRR_EM = (d: string) => `(select coalesce(sum(valor_mensal_cent), 0) from assinatura a
  where a.inicio_em <= ${d} and (a.cancelado_em is null or a.cancelado_em > ${d}))`;

export async function resumoFinanceiro(ano: number) {
  const mensal = await q(`
    with meses as (select generate_series(make_date($1, 1, 1), make_date($1, 12, 1), interval '1 month')::date as mes)
    select m.mes,
      coalesce((select sum(valor_cent) from fatura f where f.status = 'paga' and f.tipo = 'projeto' and date_trunc('month', f.pago_em)::date = m.mes), 0) as projeto,
      coalesce((select sum(valor_cent) from fatura f where f.status = 'paga' and f.tipo = 'recorrente' and date_trunc('month', f.pago_em)::date = m.mes), 0) as recorrente,
      coalesce((select sum(valor_cent) from fatura f where f.status = 'paga' and date_trunc('month', f.pago_em)::date = (m.mes - interval '1 year')::date), 0) as ano_anterior,
      coalesce((select valor_cent from meta_receita where mes = m.mes), 0) as meta,
      ${MRR_EM("(m.mes + interval '1 month - 1 day')::date")} as mrr,
      ${MRR_EM('(m.mes - 1)')} as mrr_inicio,
      (select coalesce(sum(valor_mensal_cent), 0) from assinatura a where a.cancelado_em >= m.mes and a.cancelado_em < m.mes + interval '1 month') as mrr_cancelado
    from meses m order by m.mes`, [ano]);

  const [k] = await q(`
    select (select mrr_cent from v_mrr) as mrr,
      (select count(distinct cliente_id) from assinatura where status = 'ativa' and valor_mensal_cent > 0) as clientes_ativos,
      (select avg((coalesce(fim, current_date) - inicio) / 30.44) from (
         select min(inicio_em) as inicio, case when bool_and(status = 'cancelada') then max(cancelado_em) end as fim
         from assinatura group by cliente_id) x) as permanencia_meses,
      (select coalesce(sum(valor_cent), 0) from fatura where status = 'paga' and date_trunc('month', pago_em) = date_trunc('month', now())) as receita_mes,
      (select coalesce(sum(valor_cent), 0) from meta_receita where mes = date_trunc('month', current_date)::date) as meta_mes,
      (select coalesce(sum(valor_cent), 0) from fatura where status in ('aberta','vencida') and vencimento < current_date) as atraso,
      (select coalesce(sum(valor_cent), 0) from fatura where status in ('aberta','vencida') and vencimento < current_date and vencimento >= current_date - 365) as atraso_12m,
      (select coalesce(sum(valor_cent), 0) from fatura where status <> 'cancelada' and vencimento < current_date and vencimento >= current_date - 365) as faturado_12m`);

  const previsao = await q(`
    select m::date as mes, (select coalesce(sum(valor_mensal_cent), 0) from assinatura a
      where a.status = 'ativa' and a.inicio_em <= (m + interval '1 month - 1 day')::date) as valor
    from generate_series(date_trunc('month', current_date) + interval '1 month', date_trunc('month', current_date) + interval '12 months', interval '1 month') m`);
  // shortcut: previsão assume que toda assinatura ativa renova; usar renovacao_em quando houver contratos com fim definido.

  const porCliente = await q(`
    select c.id, c.nome,
      coalesce((select sum(valor_mensal_cent) from assinatura a where a.cliente_id = c.id and a.status = 'ativa'), 0) as mrr,
      coalesce((select sum(valor_cent) from fatura f where f.cliente_id = c.id and f.status = 'paga'), 0) as receita_total,
      coalesce((select sum(valor_cent) from fatura f where f.cliente_id = c.id and f.status in ('aberta','vencida') and f.vencimento < current_date), 0) as em_atraso
    from cliente c order by mrr desc, c.nome`);

  return {
    mrr: k.mrr, arr: k.mrr * 12, clientes_ativos: k.clientes_ativos,
    ticket_medio: k.clientes_ativos ? Math.round(k.mrr / k.clientes_ativos) : 0,
    permanencia_meses: k.permanencia_meses === null ? null : Math.round(k.permanencia_meses * 10) / 10,
    receita_mes: k.receita_mes, meta_mes: k.meta_mes,
    inadimplencia: { valor: k.atraso, taxa: k.faturado_12m ? k.atraso_12m / k.faturado_12m : 0 },
    mensal: mensal.map(({ mrr_inicio, mrr_cancelado, ...m }) => ({ ...m, churn: mrr_inicio ? mrr_cancelado / mrr_inicio : 0 })),
    previsao, por_cliente: porCliente,
  };
}

export function financeiro(app: FastifyInstance) {
  app.get<{ Querystring: { ano?: number } }>('/api/financeiro', {
    schema: { querystring: { type: 'object', properties: { ano: { type: 'integer', minimum: 2000, maximum: 2100 } } } },
  }, (req) => resumoFinanceiro(req.query.ano ?? new Date().getFullYear()));

  app.get<{ Querystring: { ano: number } }>('/api/metas', {
    schema: { querystring: { type: 'object', required: ['ano'], properties: { ano: { type: 'integer' } } } },
  }, (req) => q('select * from meta_receita where extract(year from mes) = $1 order by mes', [req.query.ano]));

  app.put<{ Params: { mes: string }; Body: { valor_cent: number } }>('/api/metas/:mes', {
    schema: {
      params: { type: 'object', properties: { mes: { type: 'string', pattern: '^\\d{4}-\\d{2}-01$' } } },
      body: { type: 'object', required: ['valor_cent'], properties: { valor_cent: { type: 'integer', minimum: 0 } } },
    },
  }, async (req) => (await q(`insert into meta_receita (mes, valor_cent) values ($1, $2)
      on conflict (mes) do update set valor_cent = excluded.valor_cent returning *`, [req.params.mes, req.body.valor_cent]))[0]);
}
