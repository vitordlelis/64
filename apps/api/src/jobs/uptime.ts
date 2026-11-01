import tls from 'node:tls';
import { q } from '../db.ts';
import { notificar } from '../notificar.ts';

export type Check = { ok: boolean; http_status: number | null; latencia_ms: number | null; erro: string | null };

export async function checar(url: string): Promise<Check> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'VL-Command-Uptime/1.0' } });
    await r.body?.cancel();
    const ok = r.status < 400;
    return { ok, http_status: r.status, latencia_ms: Math.round(performance.now() - t0), erro: ok ? null : `HTTP ${r.status}` };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const erro = err.name === 'TimeoutError' ? 'timeout (10 s)' : err.cause?.code ?? err.cause?.message ?? err.message;
    return { ok: false, http_status: null, latencia_ms: null, erro };
  }
}

// ultimos: checks da origem principal, do mais novo para o mais antigo.
// null em queda/degradacao = manter o incidente como está.
export function avaliar(ultimos: Pick<Check, 'ok' | 'latencia_ms'>[], limiteMs: number, sondaOk: boolean) {
  const [atual] = ultimos;
  if (!atual) return { status: 'desconhecido', queda: null, degradacao: null } as const;
  const lento = (c: Pick<Check, 'ok' | 'latencia_ms'>) => c.ok && (c.latencia_ms ?? 0) > limiteMs;
  const tres = ultimos.slice(0, 3);
  const caiu = tres.length === 3 && tres.every((c) => !c.ok) && !sondaOk; // 3 falhas seguidas e a sonda externa não viu o site no ar
  return {
    status: caiu ? 'vermelho' : !atual.ok || lento(atual) ? 'amarelo' : 'verde',
    queda: caiu ? true : atual.ok ? false : null,
    degradacao: tres.length === 3 && tres.every(lento) ? true : atual.ok && !lento(atual) ? false : null,
  } as const;
}

type Sis = { id: string; nome: string; cliente: string };
export async function incidente(s: Sis, tipo: 'queda' | 'degradacao' | 'ssl' | 'dominio', ativo: boolean | null, descricao: string) {
  if (ativo === null) return;
  const link = `/sistemas/${s.id}`;
  if (ativo) {
    const novo = await q(`insert into incidente (sistema_id, tipo, descricao) values ($1, $2, $3)
      on conflict (sistema_id, tipo) where fim_em is null do nothing returning id`, [s.id, tipo, descricao]);
    if (novo.length) await notificar(tipo, tipo === 'queda' ? 'critico' : 'aviso', `${s.nome} (${s.cliente}): ${descricao}`, link);
  } else {
    const fechado = await q('update incidente set fim_em = now() where sistema_id = $1 and tipo = $2 and fim_em is null returning id', [s.id, tipo]);
    if (fechado.length) await notificar(tipo, 'info', `${s.nome} (${s.cliente}): ${tipo} resolvido`, link);
  }
}

export async function processarSistema(s: Sis & { url: string; latencia_limite_ms: number }) {
  const c = await checar(s.url);
  await q("insert into check_saude (sistema_id, origem, ok, http_status, latencia_ms, erro) values ($1, 'principal', $2, $3, $4, $5)",
    [s.id, c.ok, c.http_status, c.latencia_ms, c.erro]);
  const ultimos = await q("select ok, latencia_ms from check_saude where sistema_id = $1 and origem = 'principal' order by checado_em desc, id desc limit 3", [s.id]);
  const [sonda] = await q(`select ok from check_saude where sistema_id = $1 and origem = 'sonda_externa'
    and checado_em > now() - interval '3 minutes' order by checado_em desc limit 1`, [s.id]);
  const r = avaliar(ultimos, s.latencia_limite_ms, sonda?.ok === true);
  await q('update sistema set status_saude = $2 where id = $1', [s.id, r.status]);
  await incidente(s, 'queda', r.queda, `fora do ar (${c.erro})`);
  await incidente(s, 'degradacao', r.degradacao, `lento (${c.latencia_ms} ms, limite ${s.latencia_limite_ms} ms)`);
}

const SISTEMAS = `select s.id, s.nome, c.nome as cliente, coalesce(s.health_url, s.url) as url, s.url as url_principal,
  s.latencia_limite_ms, s.ssl_expira_em, s.dominio_expira_em
  from sistema s join cliente c on c.id = s.cliente_id where c.status = 'ativo' and s.url is not null`;

// Checagem imediata de um sistema (ao cadastrar ou pelo botão "Verificar agora").
export async function checarAgora(id: string) {
  const [s] = await q(`${SISTEMAS} and s.id = $1`, [id]);
  if (s) await processarSistema(s);
}

export async function rodarUptime() {
  const sistemas = await q(SISTEMAS);
  // shortcut: checa todos em paralelo; acima de ~200 sistemas, limitar a concorrência.
  await Promise.all(sistemas.map((s) => processarSistema(s).catch((e) => console.error('uptime', s.nome, e))));
}

export function validadeSsl(host: string): Promise<string | null> {
  return new Promise((fim) => {
    // rejectUnauthorized: false só para conseguir ler a data de um certificado já vencido; nada é enviado.
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 10_000, rejectUnauthorized: false }, () => {
      const v = sock.getPeerCertificate().valid_to;
      sock.end();
      fim(v ? new Date(v).toISOString().slice(0, 10) : null);
    });
    sock.on('error', () => fim(null));
    sock.on('timeout', () => { sock.destroy(); fim(null); });
  });
}

const diasAte = (d: string | null) => (d ? (Date.parse(d) - Date.now()) / 86_400_000 : null);

export async function rodarVencimentos() {
  for (const s of await q(SISTEMAS)) {
    const url = new URL(s.url_principal);
    if (url.protocol === 'https:') {
      const v = await validadeSsl(url.hostname);
      if (v) { s.ssl_expira_em = v; await q('update sistema set ssl_expira_em = $2 where id = $1', [s.id, v]); }
    }
    const ssl = diasAte(s.ssl_expira_em), dom = diasAte(s.dominio_expira_em);
    await incidente(s, 'ssl', ssl === null ? null : ssl < 15, `certificado SSL vence em ${s.ssl_expira_em}`);
    await incidente(s, 'dominio', dom === null ? null : dom < 30, `domínio vence em ${s.dominio_expira_em}`);
  }
}
