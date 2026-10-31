import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32, cifra, decifra, hashSenha, totp, verificaSenha, verificaTotp } from '../src/crypto.ts';
import { avaliar } from '../src/jobs/uptime.ts';

process.env.APP_KEY = 'k'.repeat(40);

test('TOTP bate com os vetores da RFC 6238 (SHA-1)', () => {
  const segredo = base32(Buffer.from('12345678901234567890'));
  assert.equal(segredo, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totp(segredo, 59_000), '287082');
  assert.equal(totp(segredo, 1111111109_000), '081804');
  assert.equal(totp(segredo, 2000000000_000), '279037');
  assert.ok(verificaTotp(segredo, '287082', 59_000 + 30_000)); // tolera um passo de relógio
  assert.ok(!verificaTotp(segredo, '287082', 59_000 + 120_000));
});

test('senha: hash confere só com a senha certa', async () => {
  const h = await hashSenha('senha-muito-forte');
  assert.ok(await verificaSenha('senha-muito-forte', h));
  assert.ok(!(await verificaSenha('senha-errada!!', h)));
});

test('cifra AES-GCM: ida e volta e detecção de adulteração', () => {
  const c = cifra('segredo');
  assert.equal(decifra(c), 'segredo');
  const [iv, tag, enc] = c.split('.');
  assert.throws(() => decifra([iv, tag, Buffer.from('xxxxxxx').toString('base64')].join('.')));
  assert.ok(enc);
});

test('semáforo de uptime', () => {
  const ok = (ms = 100) => ({ ok: true, latencia_ms: ms });
  const falha = { ok: false, latencia_ms: null };
  assert.deepEqual(avaliar([ok()], 1000, false), { status: 'verde', queda: false, degradacao: false });
  assert.deepEqual(avaliar([falha, ok()], 1000, false), { status: 'amarelo', queda: null, degradacao: null });
  assert.deepEqual(avaliar([falha, falha, falha], 1000, false), { status: 'vermelho', queda: true, degradacao: null });
  assert.equal(avaliar([falha, falha, falha], 1000, true).status, 'amarelo'); // sonda externa vê no ar: não abre queda
  assert.deepEqual(avaliar([ok(2000), ok(2000), ok(2000)], 1000, false), { status: 'amarelo', queda: false, degradacao: true });
  assert.equal(avaliar([], 1000, false).status, 'desconhecido');
});

test('mensagens: variáveis, ordem dos parâmetros e horário comercial', async () => {
  const { renderizar, parametrosEmOrdem, emHorarioComercial } = await import('../src/mensagens.ts');
  const v = { nome_cliente: 'Ana', valor: 'R$ 10,00' };
  assert.equal(renderizar('Oi {nome_cliente}, {valor} até {data_vencimento}. {x}', v), 'Oi Ana, R$ 10,00 até —. {x}');
  assert.deepEqual(parametrosEmOrdem('{valor} de {nome_cliente}', v), ['R$ 10,00', 'Ana']);
  assert.ok(emHorarioComercial(new Date('2026-11-04T13:00:00Z')));   // quarta, 10h em Brasília
  assert.ok(!emHorarioComercial(new Date('2026-11-04T22:00:00Z')));  // quarta, 19h
  assert.ok(!emHorarioComercial(new Date('2026-11-07T13:00:00Z')));  // sábado
});

test('catálogo de ações recusa parâmetros perigosos', async () => {
  const { acaoValida } = await import('../src/acoes.ts');
  const base = { sistema_id: 'x', ip: '203.0.113.9', horas: 24 };
  assert.ok(acaoValida('bloquear_ip', base));
  assert.ok(!acaoValida('bloquear_ip', { ...base, ip: '203.0.113.0/24' })); // faixa
  assert.ok(!acaoValida('bloquear_ip', { ...base, horas: 1000 }));
  assert.ok(!acaoValida('apagar_banco', {}));
});
