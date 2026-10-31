import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

// scrypt (nativo do Node) com custo alto: N=2^17, r=8 (~128 MB por hash).
const OPTS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const scryptP = (senha: string, salt: Buffer) =>
  new Promise<Buffer>((ok, erro) => scrypt(senha, salt, 32, OPTS, (e, k) => (e ? erro(e) : ok(k))));

export async function hashSenha(senha: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scryptP(senha, salt)).toString('base64')}`;
}

export async function verificaSenha(senha: string, armazenado: string) {
  const [alg, salt, hash] = armazenado.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  return timingSafeEqual(await scryptP(senha, Buffer.from(salt, 'base64')), Buffer.from(hash, 'base64'));
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf: Buffer) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = ((val << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return bits > 0 ? out + B32[(val << (5 - bits)) & 31] : out;
}
function deBase32(s: string) {
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32 inválido');
    val = ((val << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// TOTP RFC 6238 (SHA-1, 30 s, 6 dígitos) — compatível com Google Authenticator, Authy, 1Password.
export function totp(segredo: string, agora = Date.now()) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(agora / 30000)));
  const h = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  return String((h.readUInt32BE(h[19]! & 15) & 0x7fffffff) % 1e6).padStart(6, '0');
}
export const verificaTotp = (segredo: string, codigo: string, agora = Date.now()) =>
  [-1, 0, 1].some((d) => totp(segredo, agora + d * 30000) === codigo); // tolera 30 s de relógio

function chave() {
  const k = process.env.APP_KEY;
  if (!k || k.length < 32) throw new Error('APP_KEY ausente ou curta (mínimo 32 caracteres)');
  return createHash('sha256').update(k).digest();
}
export function cifra(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decifra(s: string) {
  const [iv, tag, enc] = s.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', chave(), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(enc!), d.final()]).toString('utf8');
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const novoToken = () => randomBytes(32).toString('base64url');
export const iguais = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));
