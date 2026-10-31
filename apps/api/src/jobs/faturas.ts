import { q } from '../db.ts';
import { notificar } from '../notificar.ts';
import { asaas, asaasAtivo } from '../asaas.ts';

// Gera a fatura recorrente da competência para cada assinatura ativa no mês do seu ciclo. Idempotente.
export async function gerarFaturas(competencia?: string) {
  return q(`
    insert into fatura (cliente_id, assinatura_id, tipo, valor_cent, competencia, vencimento)
    select a.cliente_id, a.id, 'recorrente', a.valor_mensal_cent * m.meses, $1::date,
           greatest($1::date + (a.dia_vencimento - 1), a.inicio_em)
    from assinatura a
    cross join lateral (select case a.ciclo when 'mensal' then 1 when 'trimestral' then 3 else 12 end as meses) m
    cross join lateral (select age($1::date, date_trunc('month', a.inicio_em)) as idade) i
    where a.status = 'ativa' and a.valor_mensal_cent > 0 and date_trunc('month', a.inicio_em) <= $1::date
      and (extract(year from i.idade) * 12 + extract(month from i.idade))::int % m.meses = 0
    on conflict (assinatura_id, competencia) where tipo = 'recorrente' do nothing
    returning id`, [competencia ?? new Date().toISOString().slice(0, 8) + '01']);
}

export async function marcarVencidas() {
  const vencidas = await q(`update fatura f set status = 'vencida' from cliente c
    where f.status = 'aberta' and f.vencimento < current_date and c.id = f.cliente_id
    returning f.valor_cent, f.vencimento, c.nome`);
  for (const f of vencidas) {
    await notificar('fatura_vencida', 'aviso', `Fatura vencida: ${f.nome} — ${(f.valor_cent / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (venc. ${f.vencimento})`, '/faturas?status=vencida');
  }
}

// Cria no Asaas as cobranças das faturas em aberto que ainda não têm cobrança.
export async function sincronizarAsaas() {
  if (!asaasAtivo()) return;
  const pendentes = await q(`select f.id, f.valor_cent, f.vencimento, f.tipo, c.id as cliente_id, c.nome, c.documento, c.email, c.whatsapp, c.asaas_customer_id
    from fatura f join cliente c on c.id = f.cliente_id
    where f.status in ('aberta','vencida') and f.gateway_id is null order by f.vencimento limit 50`);
  for (const f of pendentes) {
    try {
      let customer = f.asaas_customer_id;
      if (!customer) {
        if (!f.documento) { console.warn(`Asaas: cliente ${f.nome} sem CPF/CNPJ, cobrança não criada`); continue; }
        customer = (await asaas('/customers', 'POST', { name: f.nome, cpfCnpj: f.documento, email: f.email ?? undefined, mobilePhone: f.whatsapp ?? undefined })).id;
        await q('update cliente set asaas_customer_id = $2 where id = $1', [f.cliente_id, customer]);
      }
      const hoje = new Date().toISOString().slice(0, 10);
      const p = await asaas('/payments', 'POST', {
        customer, billingType: 'UNDEFINED', value: f.valor_cent / 100, externalReference: f.id,
        dueDate: f.vencimento < hoje ? hoje : f.vencimento, description: `VL Systems — ${f.tipo === 'projeto' ? 'projeto' : 'mensalidade'}`,
      });
      await q('update fatura set gateway_id = $2, link_pagamento = $3 where id = $1', [f.id, p.id, p.invoiceUrl ?? null]);
    } catch (e) {
      console.error('Asaas: falha ao criar cobrança', f.id, e);
    }
  }
}
