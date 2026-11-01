// Cloudflare Pages + Web Analytics e Google Analytics 4 contra servidores que imitam as APIs (sem rede, sem chave real).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool, q } from '../src/db.ts';

const CF_TOKEN = 'cf_TESTE_1234567890abcdefghijklmnop';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CHAVE = JSON.stringify({ type: 'service_account', client_email: 'vlc@projeto.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
let srv: Server, app: FastifyInstance, cookie = '', deploy = 'success', visitasSemana = 100;
const graphql: string[] = [];

// 14 dias: 7 com 100 visitas/dia e 7 com `visitasSemana`/dia
const dias = () => Array.from({ length: 14 }, (_, i) => ({ d: new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10), v: i < 7 ? 100 : visitasSemana }));

before(async () => {
  srv = createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const r = (s: number, j: unknown) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(j)); };
      const u = req.url!;
      // ---- Cloudflare ----
      if (u.startsWith('/cf/')) {
        if (req.headers.authorization !== `Bearer ${CF_TOKEN}`) return r(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] });
        const ok = (result: unknown) => r(200, { success: true, errors: [], result });
        if (u.startsWith('/cf/accounts?')) return ok([{ id: 'conta1', name: 'VL Systems' }]);
        if (u === '/cf/accounts/conta1/pages/projects') return ok([
          { name: 'loja', subdomain: 'loja.pages.dev', domains: ['loja.pages.dev', 'loja.com.br'], source: { config: { owner: 'vitordlelis', repo_name: 'loja' } },
            latest_deployment: { id: `dep-${deploy}`, url: 'https://abc.loja.pages.dev', environment: 'production', created_on: '2026-11-01T10:00:00Z',
              latest_stage: { name: 'deploy', status: deploy }, deployment_trigger: { metadata: { commit_hash: 'abcdef1234', commit_message: 'Novo banner\n\nx' } } } },
          { name: 'portfolio', subdomain: 'portfolio-9x.pages.dev', domains: ['portfolio-9x.pages.dev'], source: null, latest_deployment: null },
        ]);
        if (u.startsWith('/cf/accounts/conta1/pages/projects/loja/deployments')) return ok([{ id: 'dep-1', created_on: '2026-10-30T10:00:00Z', latest_stage: { status: 'success' } }]);
        if (u.startsWith('/cf/accounts/conta1/pages/projects/')) return ok([]);
        if (u.startsWith('/cf/accounts/conta1/rum/site_info/list')) return ok([{ site_tag: 'tag-loja', host: 'loja.com.br' }]);
        if (u === '/cf/graphql') {
          const { query } = JSON.parse(corpo);
          graphql.push(query);
          return r(200, { data: { viewer: { accounts: [{
            dias: dias().map((x) => ({ count: x.v * 2, sum: { visits: x.v }, dimensions: { date: x.d } })),
            paginas: [{ count: 50, dimensions: { requestPath: '/' } }], paises: [{ count: 40, dimensions: { countryName: 'BR' } }],
            origens: [{ count: 30, dimensions: { refererHost: '' } }], aparelhos: [{ count: 80, dimensions: { deviceType: 'mobile' } }, { count: 20, dimensions: { deviceType: 'desktop' } }],
          }] } } });
        }
        return r(404, { success: false, errors: [{ code: 7003, message: 'not found' }] });
      }
      // ---- Google ----
      if (u === '/token') {
        const jwt = new URLSearchParams(corpo).get('assertion')!;
        const [h, p, s] = jwt.split('.');
        const valido = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey(privateKey), Buffer.from(s!, 'base64url'));
        const claims = JSON.parse(Buffer.from(p!, 'base64url').toString());
        if (!valido || !claims.scope.includes('analytics.readonly')) return r(400, { error: 'invalid_grant' });
        return r(200, { access_token: 'ya29.teste', expires_in: 3600 });
      }
      if (req.headers.authorization !== 'Bearer ya29.teste') return r(401, { error: { message: 'no auth' } });
      if (u.startsWith('/admin/accountSummaries')) return r(200, { accountSummaries: [{ displayName: 'VL', propertySummaries: [{ property: 'properties/123456', displayName: 'Loja' }] }] });
      if (u === '/admin/properties/123456/dataStreams') return r(200, { dataStreams: [{ webStreamData: { defaultUri: 'https://loja.com.br', measurementId: 'G-TESTE123' } }] });
      if (u === '/dados/properties/123456:batchRunReports') return r(200, { reports: [
        { rows: dias().map((x) => ({ dimensionValues: [{ value: x.d.replaceAll('-', '') }], metricValues: [{ value: String(x.v) }, { value: '50' }, { value: '200' }, { value: '0' }] })) },
        { rows: [{ metricValues: ['700', '400', '1400', '0.35', '62.4', '0'].map((value) => ({ value })) }] },
        { rows: [{ dimensionValues: [{ value: '/' }], metricValues: [{ value: '900' }] }] },
        { rows: [{ dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '1300' }] }, { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '100' }] }] },
        { rows: [{ dimensionValues: [{ value: 'mobile' }], metricValues: [{ value: '600' }] }, { dimensionValues: [{ value: 'desktop' }], metricValues: [{ value: '100' }] }] },
      ] });
      if (u === '/dados/properties/123456:runReport') return r(200, { rows: [{ dimensionValues: [{ value: 'page_view' }], metricValues: [{ value: '1400' }] }] });
      if (u === '/dados/properties/123456:runRealtimeReport') return r(200, { rows: [{ metricValues: [{ value: '3' }] }] });
      r(404, { error: { message: 'Not found' } });
    });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const b = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  Object.assign(process.env, { APP_KEY: 'k'.repeat(40), NODE_ENV: 'test', CLOUDFLARE_API_URL: `${b}/cf`, GOOGLE_TOKEN_URL: `${b}/token`, GA_DATA_URL: `${b}/dados`, GA_ADMIN_URL: `${b}/admin` });
  const { criarApp } = await import('../src/app.ts');
  const { base32, cifra, hashSenha, totp } = await import('../src/crypto.ts');
  app = await criarApp();
  const s = base32(Buffer.from('segredo-trafego-1234'));
  await q('insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3)', ['tr@vl.com', await hashSenha('senha-forte-123'), cifra(s)]);
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'tr@vl.com', senha: 'senha-forte-123', codigo: totp(s) } });
  cookie = String(r.headers['set-cookie']).split(';')[0]!;
});
after(async () => { await app.close(); srv.close(); await pool.end(); });

const req = async (method: string, url: string, payload?: object) => {
  const r = await app.inject({ method: method as 'GET', url, payload, headers: { cookie } });
  return { status: r.statusCode, body: r.body ? r.json() : null, texto: r.body };
};

test('conectar: token e chave inválidos são recusados; os válidos ficam cifrados, fora da tela e fora da auditoria', async () => {
  assert.equal((await req('PUT', '/api/cloudflare', { token: 'x'.repeat(40) })).status, 400);
  assert.equal((await req('PUT', '/api/cloudflare', { token: CF_TOKEN })).body.conta_nome, 'VL Systems');
  assert.equal((await req('PUT', '/api/google', { chave: '{"nada": "' + 'x'.repeat(120) + '"}' })).status, 400);
  const g = await req('PUT', '/api/google', { chave: CHAVE });
  assert.equal(g.status, 200, g.texto);
  assert.deepEqual(g.body.propriedades[0], { id: '123456', nome: 'Loja', conta: 'VL', hosts: ['loja.com.br'], medicao: 'G-TESTE123' });
  const tela = (await req('GET', '/api/cloudflare')).texto + (await req('GET', '/api/google')).texto;
  assert.ok(!tela.includes(CF_TOKEN) && !tela.includes('PRIVATE KEY'));
  const log = JSON.stringify(await q("select contexto from log_auditoria where acao in ('PUT /api/cloudflare', 'PUT /api/google')"));
  assert.ok(!log.includes(CF_TOKEN) && !log.includes('PRIVATE KEY'));
  const [{ segredo }] = await q("select segredo from integracao where nome = 'google'");
  assert.ok(!segredo.includes('PRIVATE KEY'));
});

test('sincronizar: liga sozinho pelo repositório e endereço, junta Cloudflare + GA, avisa deploy falho e queda', async () => {
  const { sincronizarTrafego } = await import('../src/trafego.ts');
  await q("update sistema set github_repo = null, cf_projeto = null, ga_propriedade = null"); // sobras de outros testes (mesmo repositório)
  const [{ id: cli }] = await q("insert into cliente (nome) values ('Cliente Loja') returning id");
  const [{ id }] = await q("insert into sistema (cliente_id, nome, url, github_repo) values ($1, 'Loja', 'https://loja.com.br', 'vitordlelis/loja') returning id", [cli]);
  await sincronizarTrafego();
  const [s] = await q('select cf_projeto, ga_propriedade, trafego from sistema where id = $1', [id]);
  assert.equal(s.cf_projeto, 'loja');
  assert.equal(s.ga_propriedade, '123456');
  assert.equal(s.trafego.cloudflare.deploy.mensagem, 'Novo banner');
  assert.equal(s.trafego.cloudflare.analytics.dias.length, 14);
  assert.equal(s.trafego.ga.totais.usuarios, 700);
  assert.equal(s.trafego.ga.agora, 3);
  assert.equal(s.trafego.ga.dias[0].data.length, 10);
  assert.ok(graphql[0]!.includes('tag-loja'));
  const d = s.trafego.dicas.join('\n');
  assert.match(d, /celular/);       // 86% mobile
  assert.match(d, /engajadas/);     // 35%
  assert.match(d, /evento-chave/);  // 0 conversões

  deploy = 'failure'; visitasSemana = 30;
  await sincronizarTrafego(); await sincronizarTrafego(); // repetir não duplica alertas
  assert.equal((await q("select count(*)::int as n from notificacao where titulo like 'Deploy falhou no Cloudflare: Loja%'"))[0].n, 1);
  assert.equal((await q("select count(*)::int as n from notificacao where titulo like 'Visitas caíram 70% em Loja%'"))[0].n, 1);

  const t = (await req('GET', '/api/trafego')).body.find((x: { id: string }) => x.id === id);
  assert.equal(t.fonte, 'ga');
  assert.deepEqual(t.semana, { atual: 210, anterior: 700, pct: -70 });
  assert.equal(t.deploy.status, 'failure');
});

test('importar do Cloudflare: cria sistema só para o projeto que não está ligado', async () => {
  const r = await req('POST', '/api/cloudflare/importar');
  assert.equal(r.body.importados, 1);
  const [p] = await q("select url, hospedagem from sistema where cf_projeto = 'portfolio'");
  assert.equal(p.url, 'https://portfolio-9x.pages.dev');
  assert.equal((await req('POST', '/api/cloudflare/importar')).body.importados, 0);
  const lista = (await req('GET', '/api/cloudflare/projetos')).body;
  assert.ok(lista.every((x: { sistema: unknown }) => x.sistema));
});

test('agentes: ferramenta ver_trafego entrega números e dicas, com conteúdo de visitantes isolado', async () => {
  const { ferramentasDe } = await import('../src/agentes/ferramentas.ts');
  const [{ id }] = await q("select id from sistema where cf_projeto = 'loja'");
  const f = ferramentasDe({ funcao: 'marketing', agenteId: null } as never);
  const r = JSON.parse(await f.executar('ver_trafego', { sistema_id: id }));
  assert.equal(r.semana.pct, -70);
  assert.ok(r.detalhes.startsWith('<conteudo_nao_confiavel>'));
  await assert.rejects(ferramentasDe({ funcao: 'soc', agenteId: null } as never).executar('ver_trafego', { sistema_id: id }));
});

test('excluir sistema: apaga o sistema e o histórico de medições; recusa se houver cobrança', async () => {
  const [{ id: cli }] = await q("insert into cliente (nome) values ('Cliente Excluir') returning id");
  const [{ id }] = await q("insert into sistema (cliente_id, nome, url) values ($1, 'Engano', 'https://engano.exemplo') returning id", [cli]);
  await q("insert into check_saude (sistema_id, ok, latencia_ms, origem) values ($1, true, 100, 'principal')", [id]);
  const [{ id: tid }] = await q("insert into tarefa (sistema_id, origem, titulo, descricao) values ($1, 'admin_texto', 'x', 'y') returning id", [id]);
  assert.equal((await req('DELETE', `/api/sistemas/${id}`)).status, 200);
  assert.equal((await q('select 1 from sistema where id = $1', [id])).length, 0);
  assert.equal((await q('select status, sistema_id from tarefa where id = $1', [tid]))[0].status, 'expirada');

  const [{ id: pago }] = await q("insert into sistema (cliente_id, nome) values ($1, 'Pago') returning id", [cli]);
  await q("insert into assinatura (cliente_id, sistema_id, inicio_em, valor_mensal_cent) values ($1, $2, current_date, 1000)", [cli, pago]);
  assert.equal((await req('DELETE', `/api/sistemas/${pago}`)).status, 409);
  assert.equal((await q('select 1 from sistema where id = $1', [pago])).length, 1);
});
