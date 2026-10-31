import { pool, q } from './db.ts';
import { notificar } from './notificar.ts';
import { brl } from './util.ts';

export const VARIAVEIS = ['nome_cliente', 'valor', 'data_vencimento', 'nome_sistema', 'link_pagamento'] as const;
export type Vars = Partial<Record<(typeof VARIAVEIS)[number], string>>;

export const renderizar = (texto: string, v: Vars) =>
  texto.replace(/\{(\w+)\}/g, (m, k: keyof Vars) => (VARIAVEIS.includes(k) ? v[k] ?? '—' : m));
// Ordem das variáveis no texto = ordem dos parâmetros do template do WhatsApp.
export const parametrosEmOrdem = (texto: string, v: Vars) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => v[m[1] as keyof Vars] ?? '—');

// Seg–sex, 8h–18h no horário de Brasília.
export function emHorarioComercial(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const h = Number(p.hour);
  return !['Sat', 'Sun'].includes(p.weekday!) && h >= 8 && h < 18;
}

export type Destinatario = {
  cliente_id: string; fatura_id?: string | null; nome_cliente: string; email: string | null; whatsapp: string | null;
  optout_email: boolean; optout_whatsapp: boolean; valor_cent?: number | null; data?: string | null; nome_sistema?: string | null; link_pagamento?: string | null;
};
type Modelo = { id: string; nome: string; canal: 'email' | 'whatsapp'; corpo: string; assunto: string | null; exige_confirmacao: boolean };

const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : undefined);

// Cria os envios (pendentes) e UMA tarefa com o lote. Lote vazio (todos já enviados/opt-out) não cria nada.
export async function prepararLote(modelo: Modelo, destinatarios: Destinatario[], origem: 'evento' | 'admin_texto', adminId?: string) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const autoAprovado = origem === 'evento' && !modelo.exige_confirmacao; // admin desligou a confirmação deste modelo
    const [aprovador] = autoAprovado ? (await c.query('select id from admin limit 1')).rows : [];
    const { rows: [t] } = await c.query(`insert into tarefa (agente_id, origem, titulo, descricao, acao_tipo, acao_payload, impacto, status, aprovada_por, decidida_em)
      values ((select id from agente where funcao = 'marketing'), $1, $2, $3, 'enviar_mensagens', $4, 'baixo', $5, $6, $7) returning id`,
      [origem, `Enviar "${modelo.nome}" (${modelo.canal})`, autoAprovado ? 'Envio automático: confirmação desligada neste modelo.' : 'Confira os destinatários e o texto antes de aprovar.',
        { modelo_id: modelo.id }, autoAprovado ? 'aprovada' : 'aguardando', aprovador?.id ?? null, autoAprovado ? new Date() : null]);
    let n = 0;
    for (const d of destinatarios) {
      const destino = modelo.canal === 'email' ? (d.optout_email ? null : d.email) : (d.optout_whatsapp ? null : d.whatsapp);
      if (!destino) continue;
      const v: Vars = { nome_cliente: d.nome_cliente, valor: d.valor_cent != null ? brl(d.valor_cent) : undefined, data_vencimento: fmtData(d.data),
        nome_sistema: d.nome_sistema ?? undefined, link_pagamento: d.link_pagamento ?? undefined };
      const r = await c.query(`insert into envio_mensagem (modelo_id, cliente_id, fatura_id, tarefa_id, canal, destino, conteudo, variaveis)
        values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (modelo_id, cliente_id, fatura_id) do nothing`,
        [modelo.id, d.cliente_id, d.fatura_id ?? null, t.id, modelo.canal, destino, renderizar(modelo.corpo, v), v]);
      n += r.rowCount ?? 0;
    }
    if (!n) { await c.query('rollback'); return null; }
    await c.query("update tarefa set descricao = descricao || ' ' || $2 || ' destinatário(s).' where id = $1", [t.id, n]);
    await c.query('commit');
    if (!autoAprovado) await notificar('tarefa_aguardando', 'aviso', `Aprovação pendente: ${modelo.nome} para ${n} cliente(s)`, '/aprovacoes');
    return { tarefa_id: t.id as string, total: n, adminId };
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

const SELECT_CLIENTE = `c.id as cliente_id, c.nome as nome_cliente, c.email, c.whatsapp, c.optout_email, c.optout_whatsapp`;
const POR_FATURA = (where: string) => `select ${SELECT_CLIENTE}, f.id as fatura_id, f.valor_cent, f.vencimento::text as data, s.nome as nome_sistema, f.link_pagamento
  from fatura f join cliente c on c.id = f.cliente_id left join assinatura a on a.id = f.assinatura_id left join sistema s on s.id = a.sistema_id
  where c.status = 'ativo' and ${where}`;
const SEM_REPETIR = `not exists (select 1 from envio_mensagem e where e.modelo_id = $1 and e.cliente_id = c.id and e.criado_em > now() - interval '20 days')`;

export function destinatariosDoGatilho(gatilho: string, modeloId: string, dias: number | null): Promise<Destinatario[]> | null {
  const d = dias ?? 0;
  switch (gatilho) {
    case 'dias_vencimento': // janela de 3 dias para não perder o envio num fim de semana
      return q(POR_FATURA(`f.status in ('aberta','vencida') and current_date - f.vencimento between $2::int and $2::int + 2 and $1::uuid is not null`), [modeloId, d]);
    case 'fatura_gerada':
      return q(POR_FATURA(`f.status in ('aberta','vencida') and f.criado_em > now() - interval '2 days' and $1::uuid is not null`), [modeloId]);
    case 'pagamento_confirmado':
      return q(POR_FATURA(`f.status = 'paga' and f.pago_em > now() - interval '2 days' and $1::uuid is not null`), [modeloId]);
    case 'assinatura_expirando':
      return q(`select ${SELECT_CLIENTE}, a.valor_mensal_cent as valor_cent, a.renovacao_em::text as data, s.nome as nome_sistema
        from assinatura a join cliente c on c.id = a.cliente_id left join sistema s on s.id = a.sistema_id
        where c.status = 'ativo' and a.status = 'ativa' and a.renovacao_em - current_date between 0 and $2::int and ${SEM_REPETIR}`, [modeloId, d]);
    case 'dominio_expirando':
    case 'ssl_expirando': {
      const col = gatilho === 'dominio_expirando' ? 'dominio_expira_em' : 'ssl_expira_em';
      return q(`select ${SELECT_CLIENTE}, s.${col}::text as data, s.nome as nome_sistema from sistema s join cliente c on c.id = s.cliente_id
        where c.status = 'ativo' and s.${col} - current_date between 0 and $2::int and ${SEM_REPETIR}`, [modeloId, d]);
    }
    case 'agendado':
      return q(`select ${SELECT_CLIENTE} from cliente c where c.status = 'ativo' and $1::uuid is not null`, [modeloId]);
    default:
      return null; // manual
  }
}

export async function rodarGatilhos() {
  const comercial = emHorarioComercial();
  const modelos = await q(`select * from modelo_mensagem where ativo and gatilho <> 'manual'
    and (gatilho <> 'agendado' or proximo_envio_em <= now())`);
  for (const m of modelos) {
    if (m.horario_comercial && !comercial) continue;
    const dest = await destinatariosDoGatilho(m.gatilho, m.id, m.gatilho_dias);
    if (!dest) continue;
    await prepararLote(m, dest, 'evento');
    if (m.gatilho === 'agendado') {
      await q(`update modelo_mensagem set proximo_envio_em = case repeticao when 'semanal' then proximo_envio_em + interval '7 days'
        when 'mensal' then proximo_envio_em + interval '1 month' end where id = $1`, [m.id]);
    }
  }
}


