// Cliente mínimo da API do Cloudflare: projetos do Pages (deploys) e Web Analytics (visitas, sem cookies).
// Token "API token" do administrador, guardado cifrado em integracao ('cloudflare').
import { q } from './db.ts';
import { cifra, decifra } from './crypto.ts';

const base = () => process.env.CLOUDFLARE_API_URL ?? 'https://api.cloudflare.com/client/v4';
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function contaCloudflare(): Promise<{ token: string; conta: string } | null> {
  const [r] = await q("select segredo, dados from integracao where nome = 'cloudflare'");
  return r ? { token: decifra(r.segredo), conta: r.dados.conta_id } : null;
}

// O executor (bloqueio de IP) usa o token do ambiente, se houver; senão, o conectado na tela.
export const tokenCloudflare = async () => process.env.CLOUDFLARE_API_TOKEN || (await contaCloudflare())?.token || null;

export async function cf(caminho: string, token: string, init: RequestInit = {}) {
  const r = await fetch(base() + caminho, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403 || j.errors?.some((e: J) => e.code === 10000 || e.code === 9109)) {
    throw new Error('token do Cloudflare inválido ou sem permissão para isso');
  }
  if (!r.ok || j.success === false) throw new Error(`Cloudflare ${r.status}: ${j.errors?.[0]?.message ?? ''}`);
  return caminho === '/graphql' ? j : j.result;
}

export async function conectarCloudflare(token: string) {
  const contas = await cf('/accounts?per_page=50', token) as J[];
  if (!contas?.length) throw new Error('o token não enxerga nenhuma conta: inclua a permissão "Conta · Configurações da conta · Ler" e, em Recursos da conta, a sua conta');
  const dados = { conta_id: contas[0]!.id, conta_nome: contas[0]!.name };
  await cf(`/accounts/${dados.conta_id}/pages/projects`, token); // confere a permissão do Pages já na conexão
  await q(`insert into integracao (nome, segredo, dados) values ('cloudflare', $1, $2)
    on conflict (nome) do update set segredo = excluded.segredo, dados = excluded.dados, atualizado_em = now()`, [cifra(token), dados]);
  return dados;
}

const resumoDeploy = (d: J | null | undefined) => d && ({
  id: d.id, url: d.url, data: d.created_on, ambiente: d.environment,
  etapa: d.latest_stage?.name, status: d.latest_stage?.status, // status: success | failure | active | idle | canceled
  commit: d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7), mensagem: d.deployment_trigger?.metadata?.commit_message?.split('\n')[0],
});

export async function projetosPages(token: string, conta: string) {
  const ps = await cf(`/accounts/${conta}/pages/projects`, token) as J[];
  // shortcut: só a primeira página da lista (até ~25 projetos); paginar se a conta tiver mais.
  return ps.map((p) => ({
    nome: p.name as string, subdominio: p.subdomain as string, dominios: (p.domains ?? []) as string[],
    repo: p.source?.config?.owner && p.source.config.repo_name ? `${p.source.config.owner}/${p.source.config.repo_name}` : null,
    deploy: resumoDeploy(p.latest_deployment),
  }));
}

export async function deploysPages(token: string, conta: string, projeto: string) {
  const ds = await cf(`/accounts/${conta}/pages/projects/${projeto}/deployments?env=production&per_page=10`, token) as J[];
  return ds.map(resumoDeploy);
}

// Sites do Web Analytics (o Pages cria um ao ativar "Web Analytics" em Metrics).
export async function sitesAnalytics(token: string, conta: string) {
  const ss = await cf(`/accounts/${conta}/rum/site_info/list?per_page=100`, token).catch(() => []) as J[];
  return ss.map((s) => ({ tag: s.site_tag as string, host: String(s.host ?? s.ruleset?.zone_name ?? '') }));
}

// Visitas dos últimos `dias`, por dia, e os principais caminhos, países, origens e aparelhos.
export async function analyticsSite(token: string, conta: string, tag: string, dias = 28) {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const filtro = `{ AND: [{ datetime_geq: ${JSON.stringify(desde)} }, { siteTag: ${JSON.stringify(tag)} }] }`;
  const top = (dim: string) => `rumPageloadEventsAdaptiveGroups(limit: 8, filter: ${filtro}, orderBy: [count_DESC]) { count dimensions { ${dim} } }`;
  const query = `{ viewer { accounts(filter: { accountTag: ${JSON.stringify(conta)} }) {
    dias: rumPageloadEventsAdaptiveGroups(limit: 100, filter: ${filtro}, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    paginas: ${top('requestPath')} paises: ${top('countryName')} origens: ${top('refererHost')} aparelhos: ${top('deviceType')}
  } } }`;
  const j = await cf('/graphql', token, { method: 'POST', body: JSON.stringify({ query }) });
  if (j.errors?.length) throw new Error(`Cloudflare Analytics: ${j.errors[0].message}`);
  const a = j.data?.viewer?.accounts?.[0] ?? {};
  const lista = (l: J[] | undefined, dim: string) => (l ?? []).map((x) => ({ nome: x.dimensions[dim] || '(direto)', valor: x.count as number }));
  return {
    dias: (a.dias ?? []).map((d: J) => ({ data: d.dimensions.date, visitas: d.sum.visits, paginas: d.count })),
    paginas: lista(a.paginas, 'requestPath'), paises: lista(a.paises, 'countryName'),
    origens: lista(a.origens, 'refererHost'), aparelhos: lista(a.aparelhos, 'deviceType'),
  };
}
