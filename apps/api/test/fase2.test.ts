// Fase 2: lote de mensagens com aprovação, Executor, ingestão de eventos e SOC.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { pool, q } from '../src/db.ts';
import { criarApp } from '../src/app.ts';
import { base32, cifra, hashSenha, totp } from '../src/crypto.ts';
import { prepararLote, destinatariosDoGatilho } from '../src/mensagens.ts';
import { processarUma } from '../src/executor.ts';
import { rodarSoc } from '../src/jobs/soc.ts';

Object.assign(process.env, { APP_KEY: 'k'.repeat(40), NODE_ENV: 'test', MODO_DEMONSTRACAO: '1' });
let app: FastifyInstance, cookie = '', clienteId = '', sistemaId = '';
const segredo = base32(Buffer.from('segredo-fase-2-xyz'));
const req = async (method: string, url: string, payload?: object, headers: Record<string, string> = {}) => {
  const r = await app.inject({ method: method as 'GET', url, payload, headers: { cookie, ...headers } });
  return { status: r.statusCode, body: r.body ? r.json() : null };
};

before(async () => {
  app = await criarApp();
  await q('insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3)', ['f2@vl.com', await hashSenha('senha-forte-123'), cifra(segredo)]);
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'f2@vl.com', senha: 'senha-forte-123', codigo: totp(segredo) } });
  cookie = String(r.headers['set-cookie']).split(';')[0]!;
  [{ id: clienteId }] = await q("insert into cliente (nome, email) values ('Loja F2', 'loja@f2.com') returning id");
  [{ id: sistemaId }] = await q("insert into sistema (cliente_id, nome, url) values ($1, 'Loja', 'https://loja.f2') returning id", [clienteId]);
  await q("insert into fatura (cliente_id, tipo, valor_cent, competencia, vencimento) values ($1, 'recorrente', 50000, date_trunc('month', current_date), current_date - 2)", [clienteId]);
  await q("insert into cliente (nome, email, optout_email) values ('Sem Email', 'nao@f2.com', true)");
});
after(async () => { await app.close(); await pool.end(); });

test('mensagens: lote só sai depois de aprovado, sem duplicar e respeitando opt-out', async () => {
  const [m] = await q("select * from modelo_mensagem where nome = 'Aviso de atraso'");
  const dest = (await destinatariosDoGatilho(m.gatilho, m.id, m.gatilho_dias))!;
  assert.ok(dest.some((d) => d.cliente_id === clienteId));
  const lote = (await prepararLote(m, dest, 'evento'))!;
  assert.equal(lote.total, 1);
  assert.equal(await prepararLote(m, dest, 'evento'), null); // mesma fatura não recebe duas vezes

  assert.equal(await processarUma(), false); // aguardando: o Executor não toca
  const det = (await req('GET', `/api/tarefas/${lote.tarefa_id}`)).body;
  assert.match(det.envios[0].conteudo, /Loja F2.*R\$\s?500,00/);
  assert.equal((await req('POST', `/api/tarefas/${lote.tarefa_id}/aprovar`, {})).status, 200);
  assert.equal(await processarUma(), true);
  const [t] = await q('select status, resultado from tarefa where id = $1', [lote.tarefa_id]);
  assert.equal(t.status, 'concluida');
  assert.equal(t.resultado.enviadas, 1);

  const manual = (await req('POST', '/api/mensagens/disparo', { modelo_id: m.id, cliente_ids: [clienteId] })).body;
  assert.equal((await req('POST', `/api/tarefas/${manual.tarefa_id}/rejeitar`, { motivo: 'teste' })).status, 200);
  assert.deepEqual((await q('select status from envio_mensagem where tarefa_id = $1', [manual.tarefa_id])).map((e) => e.status), ['cancelada']);
  const [optout] = await q("select id from cliente where nome = 'Sem Email'");
  assert.equal((await req('POST', '/api/mensagens/disparo', { modelo_id: m.id, cliente_ids: [optout.id] })).status, 422);
});

test('mensagens: sem modo demonstração e sem provedor, falha e registra o motivo', async () => {
  process.env.MODO_DEMONSTRACAO = '0';
  try {
    const [m] = await q("select * from modelo_mensagem where nome = 'Confirmação de pagamento'");
    const lote = (await req('POST', '/api/mensagens/disparo', { modelo_id: m.id, cliente_ids: [clienteId] })).body;
    await req('POST', `/api/tarefas/${lote.tarefa_id}/aprovar`, {});
    await processarUma();
    assert.equal((await q('select status from tarefa where id = $1', [lote.tarefa_id]))[0].status, 'falhou');
    assert.match((await q('select erro from envio_mensagem where tarefa_id = $1', [lote.tarefa_id]))[0].erro, /RESEND_API_KEY/);
  } finally {
    process.env.MODO_DEMONSTRACAO = '1';
  }
});

test('SOC: ingestão autenticada, força bruta vira alerta e proposta de bloqueio com 2FA', async () => {
  const eventos = Array.from({ length: 12 }, () => ({ tipo: 'login_falho', ip: '203.0.113.9', caminho: '/login' }));
  assert.equal((await req('POST', '/api/ingest/eventos', eventos, { 'x-vlc-chave': 'errada' })).status, 401);
  const { chave } = (await req('POST', `/api/sistemas/${sistemaId}/chave-ingestao`)).body;
  assert.equal((await req('POST', '/api/ingest/eventos', [{ tipo: 'login_falho', ip: 'xx' }], { 'x-vlc-chave': chave, cookie: '' })).status, 400);
  assert.equal((await req('POST', '/api/ingest/eventos', eventos, { 'x-vlc-chave': chave, cookie: '' })).body.recebidos, 12);

  await rodarSoc();
  await rodarSoc(); // não duplica
  const ev = await q("select * from evento_seguranca where sistema_id = $1 and tipo = 'forca_bruta'", [sistemaId]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].severidade, 'alta');
  const tarefas = await q("select * from tarefa where acao_tipo = 'bloquear_ip' and sistema_id = $1", [sistemaId]);
  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].impacto, 'alto');

  assert.equal((await req('POST', `/api/tarefas/${tarefas[0].id}/aprovar`, {})).status, 403); // sem 2FA
  assert.equal((await req('POST', `/api/tarefas/${tarefas[0].id}/aprovar`, { codigo: totp(segredo) })).status, 200);
  await processarUma();
  const [b] = await q("select id, host(ip) as ip from bloqueio_ip where sistema_id = $1 and removido_em is null", [sistemaId]);
  assert.equal(b.ip, '203.0.113.9');

  const des = await req('POST', '/api/tarefas', { acao_tipo: 'desbloquear_ip', acao_payload: { bloqueio_id: b.id }, titulo: 'Desbloquear' });
  assert.equal(des.status, 201);
  await processarUma();
  assert.equal((await q('select removido_em from bloqueio_ip where id = $1', [b.id]))[0].removido_em !== null, true);
  assert.equal((await req('POST', '/api/tarefas', { acao_tipo: 'bloquear_ip', acao_payload: { sistema_id: sistemaId, ip: '1.2.3.4', horas: 1 }, titulo: 'x' })).status, 403);
});
