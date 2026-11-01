// Cliente mínimo da API REST do GitHub (token pessoal "fine-grained" do administrador).
import { q } from './db.ts';
import { cifra, decifra } from './crypto.ts';
import { notificar } from './notificar.ts';

const base = () => process.env.GITHUB_API_URL ?? 'https://api.github.com';

export async function tokenGithub(): Promise<string | null> {
  const [r] = await q("select segredo from integracao where nome = 'github'");
  return r ? decifra(r.segredo) : null;
}

export class ErroGithub extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

export async function gh(caminho: string, token: string, init: RequestInit = {}) {
  const r = await fetch(base() + caminho, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
      'user-agent': 'vl-command', ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = r.status === 401 ? 'token do GitHub inválido ou expirado'
      : r.status === 403 ? 'o token não tem permissão para isso (ou limite de uso do GitHub atingido)'
      : r.status === 404 ? 'repositório não encontrado ou sem acesso pelo token' : `GitHub ${r.status}: ${j?.message ?? ''}`;
    throw new ErroGithub(r.status, msg);
  }
  return j;
}

// Valida o token e guarda cifrado.
export async function conectarGithub(token: string) {
  const u = await gh('/user', token);
  const dados = { login: u.login, nome: u.name ?? u.login, avatar: u.avatar_url };
  await q(`insert into integracao (nome, segredo, dados) values ('github', $1, $2)
    on conflict (nome) do update set segredo = excluded.segredo, dados = excluded.dados, atualizado_em = now()`, [cifra(token), dados]);
  return dados;
}

export async function statusRepo(repo: string, token: string) {
  const r = await gh(`/repos/${repo}`, token);
  const ramo = encodeURIComponent(r.default_branch);
  const [commits, runs, prs, release] = await Promise.all([
    gh(`/repos/${repo}/commits?per_page=5&sha=${ramo}`, token),
    gh(`/repos/${repo}/actions/runs?per_page=1&branch=${ramo}`, token).catch(() => null), // sem Actions habilitado
    gh(`/repos/${repo}/pulls?state=open&per_page=100`, token),
    gh(`/repos/${repo}/releases/latest`, token).catch(() => null),                          // 404 = sem release
  ]);
  const run = runs?.workflow_runs?.[0];
  return {
    url: r.html_url, privado: r.private, branch: r.default_branch, homepage: r.homepage || null, descricao: r.description,
    ultimo_push: r.pushed_at, prs_abertos: prs.length, issues_abertas: Math.max(0, r.open_issues_count - prs.length), // a API soma PRs nas issues
    commits: (commits as Record<string, any>[]).map((c) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      sha: String(c.sha).slice(0, 7), mensagem: String(c.commit?.message ?? '').split('\n')[0], autor: c.commit?.author?.name, data: c.commit?.author?.date, url: c.html_url,
    })),
    ci: run ? { nome: run.name, status: run.status, conclusao: run.conclusion, url: run.html_url, data: run.created_at, commit: String(run.head_sha).slice(0, 7) } : null,
    release: release ? { tag: release.tag_name, data: release.published_at, url: release.html_url } : null,
  };
}

// Atualiza o retrato do GitHub de um sistema (ou de todos) e avisa quando o build quebra ou volta.
export async function sincronizarGithub(sistemaId?: string) {
  const token = await tokenGithub();
  if (!token) return;
  const sistemas = await q(`select s.id, s.nome, s.github_repo, s.github_status, c.nome as cliente from sistema s join cliente c on c.id = s.cliente_id
    where s.github_repo is not null and ($1::uuid is null or s.id = $1)`, [sistemaId ?? null]);
  for (const s of sistemas) {
    try {
      const st = await statusRepo(s.github_repo, token);
      await q('update sistema set github_status = $2, github_atualizado_em = now() where id = $1', [s.id, st]);
      const antes = s.github_status?.ci;
      if (st.ci?.conclusao === 'failure' && antes?.url !== st.ci.url) {
        await notificar('github', 'aviso', `Build falhou em ${s.nome} (${s.cliente}): ${st.ci.nome} no commit ${st.ci.commit}`, `/sistemas/${s.id}`);
      } else if (st.ci?.conclusao === 'success' && antes?.conclusao === 'failure') {
        await notificar('github', 'info', `Build voltou a passar em ${s.nome} (${s.cliente})`, `/sistemas/${s.id}`);
      }
    } catch (e) {
      await q('update sistema set github_status = coalesce(github_status, \'{}\') || $2, github_atualizado_em = now() where id = $1', [s.id, { erro: (e as Error).message }]);
    }
  }
}
