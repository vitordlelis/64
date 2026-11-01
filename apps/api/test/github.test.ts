// Integração com o GitHub contra um servidor que imita a API (sem rede, sem token real).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { pool, q } from '../src/db.ts';

const TOKEN = 'github_pat_TESTE1234567890abcdef';
let api: Server, app: FastifyInstance, cookie = '', ci = 'success';
const criadas: { titulo: string; corpo: string }[] = [];

before(async () => {
  api = createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const r = (s: number, j: unknown) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(j)); };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return r(401, { message: 'Bad credentials' });
      const u = req.url!;
      if (u === '/user') return r(200, { login: 'vitordlelis', name: 'Vitor', avatar_url: 'x' });
      if (u.startsWith('/user/repos')) return r(200, [{ full_name: 'vitordlelis/loja', private: true, homepage: 'https://loja.exemplo', description: 'Loja', pushed_at: '2026-11-01T10:00:00Z' }]);
      if (u === '/repos/vitordlelis/loja') return r(200, { html_url: 'https://github.com/vitordlelis/loja', private: true, default_branch: 'main', homepage: 'https://loja.exemplo', pushed_at: '2026-11-01T10:00:00Z', open_issues_count: 3 });
      if (u.startsWith('/repos/vitordlelis/loja/commits')) return r(200, [{ sha: 'abcdef123456', html_url: 'u', commit: { message: 'Corrige checkout\n\ndetalhes', author: { name: 'Vitor', date: '2026-11-01T10:00:00Z' } } }]);
      if (u.startsWith('/repos/vitordlelis/loja/actions/runs')) return r(200, { workflow_runs: [{ name: 'CI', status: 'completed', conclusion: ci, html_url: `run-${ci}`, created_at: 'x', head_sha: 'abcdef1234' }] });
      if (u.startsWith('/repos/vitordlelis/loja/pulls')) return r(200, [{ number: 7 }]);
      if (u === '/repos/vitordlelis/loja/releases/latest') return r(404, { message: 'Not Found' });
      if (u.startsWith('/repos/vitordlelis/loja/issues?') && req.method === 'GET') return r(200, [{ number: 3, title: 'Bug no carrinho' }, { number: 7, title: 'PR', pull_request: {} }]);
      if (u === '/repos/vitordlelis/loja/issues' && req.method === 'POST') { const b = JSON.parse(corpo); criadas.push({ titulo: b.title, corpo: b.body }); return r(201, { number: 42, html_url: 'https://github.com/vitordlelis/loja/issues/42' }); }
      r(404, { message: 'Not Found' });
    });
  });
  await new Promise<void>((ok) => api.listen(0, '127.0.0.1', ok));
  Object.assign(process.env, { APP_KEY: 'k'.repeat(40), NODE_ENV: 'test', GITHUB_API_URL: `http://127.0.0.1:${(api.address() as { port: number }).port}` });
  const { criarApp } = await import('../src/app.ts');
  const { base32, cifra, hashSenha, totp } = await import('../src/crypto.ts');
  app = await criarApp();
  const s = base32(Buffer.from('segredo-github-12345'));
  await q('insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3)', ['gh@vl.com', await hashSenha('senha-forte-123'), cifra(s)]);
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'gh@vl.com', senha: 'senha-forte-123', codigo: totp(s) } });
  cookie = String(r.headers['set-cookie']).split(';')[0]!;
});
after(async () => { await app.close(); api.close(); await pool.end(); });

const req = async (method: string, url: string, payload?: object) => {
  const r = await app.inject({ method: method as 'GET', url, payload, headers: { cookie } });
  return { status: r.statusCode, body: r.body ? r.json() : null, texto: r.body };
};

test('conectar: token inválido é recusado; o válido fica cifrado e nunca volta para a tela', async () => {
  assert.equal((await req('PUT', '/api/github', { token: 'github_pat_ERRADO1234567890xyz' })).status, 400);
  const ok = await req('PUT', '/api/github', { token: TOKEN });
  assert.equal(ok.body.login, 'vitordlelis');
  const g = await req('GET', '/api/github');
  assert.equal(g.body.conectado, true);
  assert.ok(!g.texto.includes(TOKEN));
  const [{ segredo }] = await q("select segredo from integracao where nome = 'github'");
  assert.ok(!segredo.includes(TOKEN)); // gravado cifrado
  assert.equal((await req('GET', '/api/github/repos')).body[0].nome, 'vitordlelis/loja');
});

test('sincronizar: retrato do repositório e alerta quando o build quebra e quando volta', async () => {
  const { sincronizarGithub } = await import('../src/github.ts');
  const [{ id: cli }] = await q("insert into cliente (nome) values ('GH Cliente') returning id");
  const s = await req('POST', '/api/sistemas', { cliente_id: cli, nome: 'Loja', url: 'https://loja.exemplo', github_repo: 'vitordlelis/loja' });
  assert.equal(s.status, 201);
  assert.equal((await req('POST', '/api/sistemas', { cliente_id: cli, nome: 'X', url: 'https://x', github_repo: 'nao é repo' })).status, 400);

  await sincronizarGithub();
  let [st] = await q('select github_status from sistema where id = $1', [s.body.id]);
  assert.equal(st.github_status.ci.conclusao, 'success');
  assert.equal(st.github_status.prs_abertos, 1);
  assert.equal(st.github_status.issues_abertas, 2); // 3 da API menos 1 PR
  assert.equal(st.github_status.commits[0].mensagem, 'Corrige checkout');

  ci = 'failure';
  await sincronizarGithub();
  await sincronizarGithub(); // mesmo build quebrado: não repete o alerta
  assert.equal((await q("select count(*)::int as n from notificacao where titulo like 'Build falhou em Loja%'"))[0].n, 1);
  ci = 'success';
  assert.equal((await req('POST', `/api/sistemas/${s.body.id}/github/atualizar`)).body.github_status.ci.conclusao, 'success');
  assert.equal((await q("select count(*)::int as n from notificacao where titulo like 'Build voltou a passar em Loja%'"))[0].n, 1);
  [st] = await q('select github_status from sistema where id = $1', [s.body.id]);
  assert.equal(st.github_status.erro, undefined);
});

test('agente propõe issue; só é criada no GitHub depois da aprovação', async () => {
  const { ferramentasDe } = await import('../src/agentes/ferramentas.ts');
  const { processarUma } = await import('../src/executor.ts');
  const [rafael] = await q("select id, nome, funcao from agente where funcao = 'engenheiro'");
  const [s] = await q("select id from sistema where github_repo = 'vitordlelis/loja'");
  const f = ferramentasDe({ agenteId: rafael.id, funcao: 'engenheiro', nome: rafael.nome });
  assert.match(await f.executar('ver_github', { sistema_id: s.id }), /Corrige checkout/);
  assert.match(await f.executar('propor_issue', { sistema_id: s.id, titulo: 'Checkout lento', descricao: 'Passos...' }), /aguarda aprovação/);
  assert.equal(await processarUma(), false); // aguardando: nada vai ao GitHub
  assert.equal(criadas.length, 0);
  const [t] = await q("select id from tarefa where acao_tipo = 'abrir_issue'");
  await req('POST', `/api/tarefas/${t.id}/aprovar`, {});
  await processarUma();
  assert.equal(criadas[0]!.titulo, 'Checkout lento');
  assert.equal((await q('select resultado from tarefa where id = $1', [t.id]))[0].resultado.issue, 42);
  // designer recebe a ferramenta; marketing não
  await assert.rejects(ferramentasDe({ agenteId: rafael.id, funcao: 'marketing', nome: 'M' }).executar('propor_issue', {}), /não permitida/);
});
