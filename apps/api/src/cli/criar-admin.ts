// Cria (ou redefine senha e 2FA de) o administrador único.
// Uso: pnpm --filter api criar-admin voce@vlsystems.com.br
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { pool, q } from '../db.ts';
import { base32, cifra, hashSenha } from '../crypto.ts';
import { registrar } from '../auditoria.ts';

const email = process.argv[2]?.trim().toLowerCase();
if (!email?.includes('@')) throw new Error('uso: criar-admin <email>');
const [outro] = await q('select email from admin where email <> $1', [email]);
if (outro) throw new Error(`já existe o admin ${outro.email}; o sistema tem admin único`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const senha = await rl.question('Nova senha (mínimo 12 caracteres): ');
rl.close();
if (senha.length < 12) throw new Error('senha curta demais');

const segredo = base32(randomBytes(20));
const [a] = await q(`insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3)
  on conflict (email) do update set senha_hash = excluded.senha_hash, totp_secret = excluded.totp_secret returning id`,
  [email, await hashSenha(senha), cifra(segredo)]);
await q('delete from sessao where admin_id = $1', [a.id]); // derruba sessões antigas
await registrar({ autor_tipo: 'sistema', acao: 'admin_definido', entidade: 'admin', entidade_id: a.id });

console.log('\nAdmin pronto. Cadastre o 2FA no seu app autenticador com este link (ou digite o segredo):');
console.log(`otpauth://totp/VL%20Command:${encodeURIComponent(email)}?secret=${segredo}&issuer=VL%20Command`);
console.log(`Segredo: ${segredo}\n`);
await pool.end();
