// Fase 3: loop dos agentes (contra um servidor falso da API), limites por papel, recomendações e pen test passivo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { pool, q } from '../src/db.ts';

let api: Server, site: Server, app: FastifyInstance, cookie = '';
const pedidos: { tools: { name: string }[]; messages: { role: string; content: unknown }[]; model: string }[] = [];
let roteiro: object[][] = []; // conteúdo de cada resposta, em ordem

before(async () => {
  api = createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      pedidos.push(JSON.parse(corpo));
      const content = roteiro.shift() ?? [{ type: 'text', text: 'Fim.' }];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content,
        stop_reason: content.some((b) => (b as { type: string }).type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 200 } }));
    });
  });
  site = createServer((req, res) => {
    if (req.url === '/.env') { res.end('DB_PASSWORD=segredo\n'); return; }
    if (req.url === '/') { res.setHeader('set-cookie', 'sessao=1; Path=/'); res.end('<title>Loja</title><p>ok</p>'); return; }
    res.statusCode = 404; res.end('nao');
  });
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
  Object.assign(process.env, { APP_KEY: 'k'.repeat(40), NODE_ENV: 'test', ANTHROPIC_API_KEY: 'teste', ANTHROPIC_BASE_URL: `http://127.0.0.1:${(api.address() as { port: number }).port}` });
  const { criarApp } = await import('../src/app.ts');
  const { base32, cifra, hashSenha, totp } = await import('../src/crypto.ts');
  app = await criarApp();
  const segredo = base32(Buffer.from('segredo-fase-3-xyz'));
  await q('insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3)', ['f3@vl.com', await hashSenha('senha-forte-123'), cifra(segredo)]);
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'f3@vl.com', senha: 'senha-forte-123', codigo: totp(segredo) } });
  cookie = String(r.headers['set-cookie']).split(';')[0]!;
});
after(async () => { await app.close(); api.close(); site.close(); await pool.end(); });

const agente = async (funcao: string) => (await q('select id, nome, funcao, modelo, teto_custo_dia_cent from agente where funcao = $1', [funcao]))[0];

test('agente: loop com ferramentas, proposta vira Aprovação, custo registrado', async () => {
  const { rodarAgente } = await import('../src/agentes/agentes.ts');
  const lara = await agente('designer');
  roteiro = [
    [{ type: 'tool_use', id: 't1', name: 'registrar_recomendacao', input: { titulo: 'Aumentar contraste do botão', descricao: 'Botão principal com contraste baixo.' } },
     { type: 'tool_use', id: 't2', name: 'propor_bloqueio_ip', input: { sistema_id: 'x', ip: '1.2.3.4', horas: 1, justificativa: 'x' } }],
    [{ type: 'text', text: 'Registrei 1 recomendação.' }],
  ];
  const r = await rodarAgente(lara, 'comando', 'Analise os sites.');
  assert.equal(r.texto, 'Registrei 1 recomendação.');
  assert.ok(Math.abs(r.custo - 2 * (1000 * 4 + 200 * 20) / 1e6) < 1e-12); // 2 chamadas a US$4/US$20 por milhão
  assert.ok(!pedidos[0]!.tools.some((t) => t.name === 'propor_bloqueio_ip')); // designer não recebe ferramenta de bloqueio
  const resultados = pedidos[1]!.messages.at(-1)!.content as { tool_use_id: string; is_error?: boolean; content: string }[];
  assert.equal(resultados.find((x) => x.tool_use_id === 't2')!.is_error, true); // e se tentar, é recusado
  const [t] = await q("select * from tarefa where titulo = 'Aumentar contraste do botão'");
  assert.equal(t.status, 'aguardando');
  assert.equal((await q('select estado from agente where id = $1', [lara.id]))[0].estado, 'aguardando');
  const [at] = await q('select custo_usd, tokens_entrada from atividade_agente where agente_id = $1', [lara.id]);
  assert.equal(at.tokens_entrada, 2000);

  // aprovar uma recomendação (sem ação) só a marca como concluída; o agente volta a ocioso
  assert.equal((await app.inject({ method: 'POST', url: `/api/tarefas/${t.id}/aprovar`, payload: {}, headers: { cookie } })).json().status, 'concluida');
  assert.equal((await q('select estado from agente where id = $1', [lara.id]))[0].estado, 'ocioso');
});

test('agente: teto diário de custo bloqueia novas execuções', async () => {
  const { rodarAgente } = await import('../src/agentes/agentes.ts');
  const rafael = { ...(await agente('engenheiro')), teto_custo_dia_cent: 0 };
  await assert.rejects(rodarAgente(rafael, 'comando', 'x'), /teto diário/);
});

test('comando do admin entra na fila e o worker responde', async () => {
  const { rodarAgentes } = await import('../src/agentes/agentes.ts');
  const marcos = await agente('marketing');
  const c = await app.inject({ method: 'POST', url: `/api/agentes/${marcos.id}/comando`, payload: { texto: 'Como está a inadimplência?' }, headers: { cookie } });
  assert.equal(c.statusCode, 201);
  await q('update agente set ultimo_ciclo_em = now()'); // isola o teste dos ciclos agendados
  roteiro = [[{ type: 'text', text: 'Está em 2%.' }]];
  await rodarAgentes();
  const [t] = await q('select status, resultado from tarefa where id = $1', [c.json().id]);
  assert.equal(t.status, 'concluida');
  assert.equal(t.resultado.resposta, 'Está em 2%.');
});

test('pen test passivo: exige autorização + domínio verificado + 2FA e encontra .env exposto', async () => {
  const { totp } = await import('../src/crypto.ts');
  const { processarUma } = await import('../src/executor.ts');
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const [{ id: cli }] = await q("insert into cliente (nome) values ('PT') returning id");
  const [{ id }] = await q("insert into sistema (cliente_id, nome, url) values ($1, 'Loja PT', $2) returning id", [cli, url]);
  const disparar = (codigo?: string) => app.inject({ method: 'POST', url: `/api/sistemas/${id}/pentest`, payload: { codigo }, headers: { cookie } });
  assert.equal((await disparar()).statusCode, 409); // sem autorização/verificação
  await q('update sistema set pentest_autorizado = true, dominio_verificado_em = now() where id = $1', [id]);
  assert.equal((await disparar('000000')).statusCode, 403);
  const segredo = (await import('../src/crypto.ts')).base32(Buffer.from('segredo-fase-3-xyz'));
  assert.equal((await disparar(totp(segredo))).statusCode, 201);
  await processarUma();
  const [rel] = await q('select achados from relatorio_pentest where sistema_id = $1', [id]);
  const titulos = rel.achados.map((a: { titulo: string }) => a.titulo);
  assert.ok(titulos.includes('Arquivo sensível exposto: /.env'));
  assert.ok(titulos.includes('Site sem HTTPS'));
  assert.ok(titulos.includes('Cookie sem Secure/HttpOnly'));
  assert.ok(!titulos.some((t: string) => t.includes('.git'))); // 404 não é achado
  assert.equal((await q("select count(*)::int as n from evento_seguranca where sistema_id = $1 and tipo = 'pentest_achado'", [id]))[0].n, 2); // .env (crítica) + sem HTTPS (alta)
  assert.equal((await q("select status from tarefa where agente_id = (select id from agente where funcao = 'pentester') and status = 'rascunho'"))[0].status, 'rascunho');
});
