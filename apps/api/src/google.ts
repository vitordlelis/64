// Google Analytics 4 (só leitura) com uma "conta de serviço": o arquivo JSON da chave fica cifrado em integracao ('google').
// Autenticação OAuth 2.0 server-to-server: JWT assinado com a chave privada -> token de acesso de 1 hora.
import { createPrivateKey, sign } from 'node:crypto';
import { q } from './db.ts';
import { cifra, decifra } from './crypto.ts';

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const URL_TOKEN = () => process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';
const URL_DADOS = () => process.env.GA_DATA_URL ?? 'https://analyticsdata.googleapis.com/v1beta';
const URL_ADMIN = () => process.env.GA_ADMIN_URL ?? 'https://analyticsadmin.googleapis.com/v1beta';

type Chave = { client_email: string; private_key: string };
const cache = new Map<string, { token: string; ate: number }>();

const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');

async function acesso(k: Chave) {
  const c = cache.get(k.client_email);
  if (c && c.ate > Date.now() + 60_000) return c.token;
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: k.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
  })}`;
  const jwt = `${corpo}.${b64(sign('RSA-SHA256', Buffer.from(corpo), createPrivateKey(k.private_key)))}`;
  const r = await fetch(URL_TOKEN(), {
    method: 'POST', signal: AbortSignal.timeout(15_000), headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`o Google recusou a chave (${j.error_description ?? j.error ?? r.status}); gere uma chave nova da conta de serviço`);
  cache.set(k.client_email, { token: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token as string;
}

async function google(url: string, k: Chave, body?: object) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20_000), body: body && JSON.stringify(body),
    headers: { authorization: `Bearer ${await acesso(k)}`, 'content-type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error(`sem acesso: adicione ${k.client_email} como Leitor na propriedade do Google Analytics (Administrador → Gerenciamento de acesso)`);
  if (!r.ok) throw new Error(`Google Analytics ${r.status}: ${j.error?.message ?? ''}`);
  return j;
}

export async function chaveGoogle(): Promise<Chave | null> {
  const [r] = await q("select segredo from integracao where nome = 'google'");
  return r ? JSON.parse(decifra(r.segredo)) : null;
}

// Propriedades que a conta de serviço enxerga, com o endereço e o ID de medição (G-XXXX) de cada site.
export async function propriedadesGa(k: Chave) {
  const j = await google(`${URL_ADMIN()}/accountSummaries?pageSize=200`, k);
  const props = (j.accountSummaries ?? []).flatMap((a: J) => (a.propertySummaries ?? []).map((p: J) => ({
    id: String(p.property).replace('properties/', ''), nome: p.displayName as string, conta: a.displayName as string,
  })));
  for (const p of props) {
    const s = await google(`${URL_ADMIN()}/properties/${p.id}/dataStreams`, k).catch(() => ({}));
    const web = (s.dataStreams ?? []).filter((d: J) => d.webStreamData);
    p.hosts = web.map((d: J) => { try { return new URL(d.webStreamData.defaultUri).hostname; } catch { return null; } }).filter(Boolean);
    p.medicao = web[0]?.webStreamData.measurementId ?? null;
  }
  return props as { id: string; nome: string; conta: string; hosts: string[]; medicao: string | null }[];
}

export async function conectarGoogle(json: string) {
  let k: Chave;
  try { k = JSON.parse(json); } catch { throw new Error('o conteúdo não é um arquivo JSON válido'); }
  if (!k?.client_email || !k.private_key?.includes('PRIVATE KEY')) throw new Error('use o arquivo JSON da chave de uma conta de serviço (tem client_email e private_key)');
  k = { client_email: k.client_email, private_key: k.private_key };
  const propriedades = await propriedadesGa(k);
  const dados = { email: k.client_email, propriedades };
  await q(`insert into integracao (nome, segredo, dados) values ('google', $1, $2)
    on conflict (nome) do update set segredo = excluded.segredo, dados = excluded.dados, atualizado_em = now()`, [cifra(JSON.stringify(k)), dados]);
  return dados;
}

const linhas = (r: J) => (r?.rows ?? []).map((l: J) => ({ d: (l.dimensionValues ?? []).map((v: J) => v.value), m: l.metricValues.map((v: J) => Number(v.value)) }));
const top = (r: J) => linhas(r).map((l: J) => ({ nome: l.d[0] || '(não definido)', valor: l.m[0] }));
const PERIODO = [{ startDate: '27daysAgo', endDate: 'today' }];
const pedido = (dim: string | null, metricas: string[], limite?: number) => ({
  dateRanges: PERIODO, metrics: metricas.map((name) => ({ name })),
  ...(dim ? { dimensions: [{ name: dim }] } : {}),
  ...(limite ? { limit: limite, orderBys: [{ metric: { metricName: metricas[0] }, desc: true }] } : {}),
  ...(dim === 'date' ? { orderBys: [{ dimension: { dimensionName: 'date' } }] } : {}),
});

// Últimos 28 dias da propriedade, no mesmo formato do Cloudflare onde dá (dias, páginas, origens, aparelhos).
export async function relatorioGa(k: Chave, prop: string) {
  const [lote, eventos, agora] = await Promise.all([
    google(`${URL_DADOS()}/properties/${prop}:batchRunReports`, k, { requests: [
      pedido('date', ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents']),
      pedido(null, ['activeUsers', 'newUsers', 'sessions', 'engagementRate', 'averageSessionDuration', 'keyEvents']),
      pedido('pagePath', ['screenPageViews'], 8),
      pedido('sessionDefaultChannelGroup', ['sessions'], 8),
      pedido('deviceCategory', ['activeUsers'], 5),
    ] }),
    google(`${URL_DADOS()}/properties/${prop}:runReport`, k, pedido('eventName', ['eventCount'], 10)),
    google(`${URL_DADOS()}/properties/${prop}:runRealtimeReport`, k, { metrics: [{ name: 'activeUsers' }] }).catch(() => null),
  ]);
  const [dias, totais, paginas, origens, aparelhos] = lote.reports ?? [];
  const t = linhas(totais)[0]?.m ?? [];
  return {
    dias: linhas(dias).map((l: J) => ({ data: `${l.d[0].slice(0, 4)}-${l.d[0].slice(4, 6)}-${l.d[0].slice(6)}`, visitas: l.m[0], usuarios: l.m[1], paginas: l.m[2], conversoes: l.m[3] })),
    totais: { usuarios: t[0] ?? 0, novos: t[1] ?? 0, sessoes: t[2] ?? 0, engajamento: t[3] ?? 0, duracao_media_s: Math.round(t[4] ?? 0), conversoes: t[5] ?? 0 },
    paginas: top(paginas), origens: top(origens), aparelhos: top(aparelhos), eventos: top(eventos),
    agora: agora ? (linhas(agora)[0]?.m[0] ?? 0) : null,
  };
}
