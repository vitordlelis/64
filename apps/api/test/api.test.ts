// Integração contra Postgres real. Rode via `pnpm test` (aplica as migrações num banco *_test limpo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { pool, q } from '../src/db.ts';
import { criarApp } from '../src/app.ts';
import { base32, cifra, hashSenha, totp } from '../src/crypto.ts';
import { gerarFaturas, marcarVencidas } from '../src/jobs/faturas.ts';
import { processarSistema } from '../src/jobs/uptime.ts';

Object.assign(process.env, { APP_KEY: 'k'.repeat(40), NODE_ENV: 'test', ASAAS_WEBHOOK_TOKEN: 'tok-asaas', SONDA_TOKEN: 'tok-sonda' });

let app: FastifyInstance, cookie = '', alvo: Server, statusAlvo = 200, urlAlvo = '';
const segredo = base32(Buffer.from('segredo-de-teste-123'));
const req = async (method: string, url: string, payload?: object, headers: Record<string, string> = {}) => {
  const r = await app.inject({ method: method as 'GET', url, payload, headers: { cookie, ...headers } });
  return { status: r.statusCode, body: r.body ? r.json() : null, headers: r.headers };
};

before(async () => {
  app = await criarApp();
  await q('insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3)', ['adm@vl.com', await hashSenha('senha-forte-123'), cifra(segredo)]);
  alvo = createServer((_, res) => { res.statusCode = statusAlvo; res.end('ok'); });
  await new Promise<void>((r) => alvo.listen(0, '127.0.0.1', r));
  urlAlvo = `http://127.0.0.1:${(alvo.address() as { port: number }).port}/health`;
});
after(async () => { await app.close(); alvo.close(); await pool.end(); });

test('login exige senha e TOTP; rotas privadas exigem sessão', async () => {
  assert.equal((await req('GET', '/api/clientes')).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { email: 'adm@vl.com', senha: 'senha-forte-123', codigo: '000000' })).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { email: 'adm@vl.com', senha: 'errada-errada', codigo: totp(segredo) })).status, 401);
  const r = await req('POST', '/api/auth/login', { email: 'ADM@vl.com', senha: 'senha-forte-123', codigo: totp(segredo) });
  assert.equal(r.status, 200);
  const sc = String(r.headers['set-cookie']);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0]!;
  assert.equal((await req('GET', '/api/auth/me')).body.email, 'adm@vl.com');
  assert.equal((await req('GET', '/api/auth/me')).body.pode_desligar, false);
  assert.equal((await req('POST', '/api/sistema/desligar')).status, 404); // fora do modo local o botão não existe
  // primeiro acesso: fechado quando a flag está desligada e quando já existe admin
  assert.equal((await req('GET', '/api/auth/primeiro-acesso')).body.disponivel, false);
  process.env.PERMITIR_PRIMEIRO_ACESSO = '1';
  assert.equal((await req('GET', '/api/auth/primeiro-acesso')).body.disponivel, false); // já existe admin
  const s = base32(Buffer.from('outro-segredo-qualqu')) // 20 bytes = 32 caracteres;
  assert.equal((await req('POST', '/api/auth/primeiro-acesso', { email: 'intruso@x.com', senha: 'senha-forte-123', segredo: s, codigo: totp(s) })).status, 409);
  delete process.env.PERMITIR_PRIMEIRO_ACESSO;
  const [falho] = await q("select * from log_auditoria where acao = 'login_falho'");
  assert.ok(falho);
});

let clienteId = '', mensalId = '', sistemaId = '';
test('cadastros, faturamento recorrente e financeiro', async () => {
  const c = await req('POST', '/api/clientes', { nome: 'Padaria Sol', documento: '12345678000199' });
  assert.equal(c.status, 201);
  clienteId = c.body.id;
  assert.equal((await req('POST', '/api/clientes', { nome: 'X', coluna_invalida: 1 })).body.coluna_invalida, undefined); // campos extras são descartados
  assert.equal((await req('POST', '/api/sistemas', { cliente_id: clienteId, nome: 'Site', url: 'ftp://x' })).status, 400);
  sistemaId = (await req('POST', '/api/sistemas', { cliente_id: clienteId, nome: 'Site', url: urlAlvo, latencia_limite_ms: 1000 })).body.id;

  mensalId = (await req('POST', '/api/assinaturas', { cliente_id: clienteId, valor_mensal_cent: 100000, valor_projeto_cent: 500000, inicio_em: '2026-01-15', dia_vencimento: 10 })).body.id;
  await req('POST', '/api/assinaturas', { cliente_id: clienteId, valor_mensal_cent: 30000, ciclo: 'trimestral', inicio_em: '2026-02-01' });

  assert.equal((await gerarFaturas('2026-01-01')).length, 1);
  assert.equal((await gerarFaturas('2026-03-01')).length, 1); // trimestral ainda não (1 mês)
  assert.equal((await gerarFaturas('2026-03-01')).length, 0); // idempotente
  assert.equal((await gerarFaturas('2026-05-01')).length, 2); // trimestral fecha 3 meses
  const fs = (await req('GET', `/api/faturas?cliente_id=${clienteId}`)).body;
  const jan = fs.find((f: { competencia: string }) => f.competencia === '2026-01-01');
  assert.equal(jan.vencimento, '2026-01-15'); // não vence antes do início do contrato
  assert.equal(fs.find((f: { valor_cent: number }) => f.valor_cent === 90000).competencia, '2026-05-01');

  const proj = await req('POST', '/api/faturas', { cliente_id: clienteId, assinatura_id: mensalId, tipo: 'projeto', valor_cent: 500000, vencimento: '2026-01-20' });
  assert.equal(proj.status, 201); // projeto convive com a recorrente do mesmo mês
  assert.equal((await req('POST', '/api/faturas', { cliente_id: clienteId, assinatura_id: mensalId, tipo: 'recorrente', valor_cent: 1, vencimento: '2026-01-02' })).status, 409);

  await marcarVencidas();
  assert.equal((await req('GET', '/api/faturas?status=vencida')).body.length, 5);
  assert.equal((await req('POST', `/api/faturas/${jan.id}/pagar`)).body.status, 'paga');
  assert.equal((await req('POST', `/api/faturas/${jan.id}/pagar`)).status, 409);
  await req('PUT', `/api/metas/${new Date().toISOString().slice(0, 8)}01`, { valor_cent: 200000 });

  let fin = (await req('GET', '/api/financeiro')).body;
  assert.equal(fin.mrr, 130000);
  assert.equal(fin.arr, 1560000);
  assert.equal(fin.ticket_medio, 130000);
  assert.equal(fin.receita_mes, 100000);
  assert.equal(fin.meta_mes, 200000);
  assert.equal(fin.inadimplencia.valor, 100000 + 100000 + 500000 + 90000);
  assert.equal(fin.previsao.length, 12);

  assert.equal((await req('POST', `/api/assinaturas/${mensalId}/cancelar`)).body.status, 'cancelada');
  fin = (await req('GET', '/api/financeiro')).body;
  assert.equal(fin.mrr, 30000);
  const mesAtual = fin.mensal.find((m: { mes: string }) => m.mes === new Date().toISOString().slice(0, 8) + '01');
  assert.ok(Math.abs(mesAtual.churn - 100000 / 130000) < 1e-9);

  const [aud] = await q("select * from log_auditoria where acao = 'POST /api/clientes' and autor_tipo = 'admin'");
  assert.ok(aud);
});

test('webhook do Asaas exige token e baixa a fatura', async () => {
  const [f] = await q("update fatura set gateway_id = 'pay_1' where status = 'vencida' and valor_cent = 90000 returning id");
  const corpo = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };
  assert.equal((await req('POST', '/api/webhooks/asaas', corpo, { 'asaas-access-token': 'errado' })).status, 401);
  assert.equal((await req('POST', '/api/webhooks/asaas', corpo, { 'asaas-access-token': 'tok-asaas', cookie: '' })).status, 200);
  assert.equal((await q('select status from fatura where id = $1', [f.id]))[0].status, 'paga');
});

test('uptime: 3 falhas abrem incidente, sonda externa evita falso positivo, volta fecha', async () => {
  const s = { id: sistemaId, nome: 'Site', cliente: 'Padaria Sol', url: urlAlvo, latencia_limite_ms: 5000 };
  const estado = async () => (await q('select status_saude from sistema where id = $1', [sistemaId]))[0].status_saude;
  const abertos = async () => (await q("select * from incidente where sistema_id = $1 and tipo = 'queda' and fim_em is null", [sistemaId])).length;

  await processarSistema(s);
  assert.equal(await estado(), 'verde');

  statusAlvo = 500;
  await req('POST', '/api/sonda/resultados', [{ sistema_id: sistemaId, ok: true }], { authorization: 'Bearer tok-sonda' });
  for (let i = 0; i < 3; i++) await processarSistema(s);
  assert.equal(await estado(), 'amarelo');
  assert.equal(await abertos(), 0);

  await q("delete from check_saude where origem = 'sonda_externa'");
  await processarSistema(s);
  assert.equal(await estado(), 'vermelho');
  assert.equal(await abertos(), 1);
  await processarSistema(s);
  assert.equal(await abertos(), 1); // não duplica
  assert.ok((await q("select * from notificacao where severidade = 'critico'")).length === 1);

  statusAlvo = 200;
  await processarSistema(s);
  assert.equal(await estado(), 'verde');
  assert.equal(await abertos(), 0);
  assert.equal((await req('GET', `/api/sistemas/${sistemaId}/saude`)).body.incidentes.length, 1);
  assert.equal((await req('GET', '/api/sonda/alvos', undefined, { authorization: 'Bearer errado' })).status, 401);
});
