// Catálogo FECHADO de ações que o Executor sabe executar. Nada fora daqui roda.
import { isIP } from 'node:net';
import { q } from './db.ts';
import { parametrosEmOrdem, type Vars } from './mensagens.ts';
import { pentestPassivo } from './pentest.ts';
import { gh, tokenGithub } from './github.ts';

const demo = () => process.env.MODO_DEMONSTRACAO === '1';
type Payload = Record<string, unknown>;

export const ACOES = {
  enviar_mensagens: {
    impacto: 'baixo',
    validar: (p: Payload) => typeof p.modelo_id === 'string',
  },
  bloquear_ip: {
    impacto: 'alto',
    // só um IP por vez (nunca faixas) e por no máximo 30 dias
    validar: (p: Payload) => typeof p.sistema_id === 'string' && typeof p.ip === 'string' && isIP(p.ip) > 0
      && Number.isInteger(p.horas) && (p.horas as number) >= 1 && (p.horas as number) <= 720,
  },
  desbloquear_ip: {
    impacto: 'baixo',
    validar: (p: Payload) => typeof p.bloqueio_id === 'string',
  },
  abrir_issue: {
    impacto: 'baixo',
    validar: (p: Payload) => typeof p.sistema_id === 'string' && typeof p.titulo === 'string' && p.titulo.length > 0 && p.titulo.length <= 200
      && typeof p.corpo === 'string' && p.corpo.length <= 20_000,
  },
  pentest_passivo: {
    impacto: 'alto',
    validar: (p: Payload) => typeof p.sistema_id === 'string',
  },
} as const;
export type AcaoTipo = keyof typeof ACOES;
export const acaoValida = (tipo: string, p: unknown): tipo is AcaoTipo =>
  tipo in ACOES && typeof p === 'object' && p !== null && ACOES[tipo as AcaoTipo].validar(p as Payload);

// ---------- provedores ----------
async function enviarEmail(destino: string, assunto: string, texto: string) {
  if (demo()) return `demo-${crypto.randomUUID()}`;
  if (!process.env.RESEND_API_KEY) throw new Error('E-mail não configurado (RESEND_API_KEY)');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'VL Systems <contato@vlsystems.com.br>', to: destino, subject: assunto, text: texto }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${j.message ?? ''}`);
  return j.id as string;
}

async function enviarWhatsapp(destino: string, template: string | null, parametros: string[]) {
  if (demo()) return `demo-${crypto.randomUUID()}`;
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) throw new Error('WhatsApp não configurado (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID)');
  if (!template) throw new Error('modelo sem template aprovado na Meta');
  const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: destino.replace(/\D/g, ''), type: 'template',
      template: { name: template, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${j.error?.message ?? ''}`);
  return j.messages?.[0]?.id as string;
}

async function cloudflare(caminho: string, method: string, body?: object) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, {
    method, headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(`Cloudflare ${r.status}: ${JSON.stringify(j.errors ?? '')}`);
  return j.result;
}

// ---------- execução ----------
type Tarefa = { id: string; acao_tipo: AcaoTipo; acao_payload: Payload };

export async function executar(t: Tarefa): Promise<object> {
  if (!acaoValida(t.acao_tipo, t.acao_payload)) throw new Error('ação fora do catálogo ou parâmetros inválidos');
  const p = t.acao_payload;

  if (t.acao_tipo === 'enviar_mensagens') {
    const envios = await q(`select e.*, m.assunto, m.corpo, m.wa_template_nome from envio_mensagem e join modelo_mensagem m on m.id = e.modelo_id
      where e.tarefa_id = $1 and e.status = 'pendente'`, [t.id]);
    let enviadas = 0, falhas = 0;
    for (const e of envios) {
      try {
        const v = e.variaveis as Vars;
        const id = e.canal === 'email'
          ? await enviarEmail(e.destino, e.assunto ? e.assunto.replace(/\{(\w+)\}/g, (_: string, k: keyof Vars) => v[k] ?? '—') : 'VL Systems', e.conteudo)
          : await enviarWhatsapp(e.destino, e.wa_template_nome, parametrosEmOrdem(e.corpo, v));
        await q("update envio_mensagem set status = 'enviada', provedor_id = $2, atualizado_em = now() where id = $1", [e.id, id]);
        enviadas++;
      } catch (err) {
        await q("update envio_mensagem set status = 'falhou', erro = $2, atualizado_em = now() where id = $1", [e.id, (err as Error).message]);
        falhas++;
      }
    }
    if (falhas && !enviadas) throw new Error(`nenhuma mensagem enviada (${falhas} falha(s)); veja o Histórico de mensagens`);
    return { enviadas, falhas, demonstracao: demo() };
  }

  if (t.acao_tipo === 'bloquear_ip') {
    const [s] = await q('select id, nome, waf_zona_id from sistema where id = $1', [p.sistema_id]);
    if (!s) throw new Error('sistema inexistente');
    let regra: string | null = null;
    if (!demo()) {
      if (!process.env.CLOUDFLARE_API_TOKEN || !s.waf_zona_id) throw new Error(`Cloudflare não configurado para ${s.nome} (CLOUDFLARE_API_TOKEN e zona do sistema)`);
      regra = (await cloudflare(`/zones/${s.waf_zona_id}/firewall/access_rules/rules`, 'POST', {
        mode: 'block', configuration: { target: isIP(p.ip as string) === 6 ? 'ip6' : 'ip', value: p.ip }, notes: `VL Command — tarefa ${t.id}`,
      })).id;
    }
    const [b] = await q(`insert into bloqueio_ip (sistema_id, ip, tarefa_id, waf_regra_id, expira_em) values ($1, $2, $3, $4, now() + $5 * interval '1 hour')
      on conflict (sistema_id, ip) where removido_em is null do nothing returning id`, [s.id, p.ip, t.id, regra, p.horas]);
    return { bloqueio_id: b?.id ?? null, ja_bloqueado: !b, waf_regra_id: regra, demonstracao: demo() };
  }

  if (t.acao_tipo === 'pentest_passivo') return pentestPassivo(t.id, p.sistema_id as string);

  if (t.acao_tipo === 'abrir_issue') {
    const [s] = await q('select github_repo from sistema where id = $1', [p.sistema_id]);
    if (!s?.github_repo) throw new Error('sistema sem repositório do GitHub');
    const token = await tokenGithub();
    if (!token) throw new Error('GitHub não conectado');
    const i = await gh(`/repos/${s.github_repo}/issues`, token, { method: 'POST', body: JSON.stringify({
      title: p.titulo, body: `${p.corpo}\n\n---\n_Proposto por um agente do VL Command e aprovado pelo administrador._`,
    }) });
    return { issue: i.number, url: i.html_url };
  }

  // desbloquear_ip
  return removerBloqueio(p.bloqueio_id as string);
}

export async function removerBloqueio(id: string) {
  const [b] = await q('select b.*, s.waf_zona_id from bloqueio_ip b join sistema s on s.id = b.sistema_id where b.id = $1 and b.removido_em is null', [id]);
  if (!b) return { removido: false };
  if (b.waf_regra_id) await cloudflare(`/zones/${b.waf_zona_id}/firewall/access_rules/rules/${b.waf_regra_id}`, 'DELETE');
  await q('update bloqueio_ip set removido_em = now() where id = $1', [id]);
  return { removido: true };
}
