import type { FastifyInstance } from 'fastify';
import { q } from './db.ts';
import { decifra, novoToken, sha256, verificaSenha, verificaTotp } from './crypto.ts';
import { registrar } from './auditoria.ts';

declare module 'fastify' {
  interface FastifyRequest { adminId: string | null }
}

export const COOKIE = 'vlc_sessao';
const PUBLICAS = ['/api/auth/login', '/api/webhooks/', '/api/sonda/', '/api/ingest/', '/api/health'];

// Confirmação extra (step-up) para ações de alto impacto.
export async function confereTotp(adminId: string, codigo?: string) {
  if (!codigo || !/^\d{6}$/.test(codigo)) return false;
  const [a] = await q('select totp_secret from admin where id = $1', [adminId]);
  return Boolean(a) && verificaTotp(decifra(a.totp_secret), codigo);
}

export function auth(app: FastifyInstance) {
  app.decorateRequest('adminId', null);
  app.addHook('onRequest', async (req, rep) => {
    if (!req.url.startsWith('/api/') || PUBLICAS.some((p) => req.url.startsWith(p))) return;
    const t = req.cookies[COOKIE];
    const [s] = t ? await q('select admin_id from sessao where token_hash = $1 and expira_em > now()', [sha256(t)]) : [];
    if (!s) return rep.code(401).send({ erro: 'não autenticado' });
    req.adminId = s.admin_id;
  });

  app.post<{ Body: { email: string; senha: string; codigo: string } }>('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['email', 'senha', 'codigo'], properties: {
      email: { type: 'string', maxLength: 200 }, senha: { type: 'string', maxLength: 200 }, codigo: { type: 'string', pattern: '^[0-9]{6}$' },
    } } },
  }, async (req, rep) => {
    const { email, senha, codigo } = req.body;
    const [a] = await q('select id, senha_hash, totp_secret from admin where email = $1', [email.trim().toLowerCase()]);
    const ok = a && (await verificaSenha(senha, a.senha_hash)) && verificaTotp(decifra(a.totp_secret), codigo);
    if (!ok) {
      await registrar({ autor_tipo: 'sistema', acao: 'login_falho', contexto: { email }, ip: req.ip });
      return rep.code(401).send({ erro: 'E-mail, senha ou código inválidos' });
    }
    const token = novoToken();
    await q("insert into sessao (token_hash, admin_id, expira_em) values ($1, $2, now() + interval '12 hours')", [sha256(token), a.id]);
    await registrar({ autor_tipo: 'admin', autor_id: a.id, acao: 'login', ip: req.ip });
    rep.setCookie(COOKIE, token, {
      httpOnly: true, sameSite: 'strict', path: '/', maxAge: 12 * 3600, secure: process.env.NODE_ENV === 'production',
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, rep) => {
    const t = req.cookies[COOKIE];
    if (t) await q('delete from sessao where token_hash = $1', [sha256(t)]);
    rep.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({
    ...(await q('select id, email from admin where id = $1', [req.adminId]))[0],
    pode_desligar: process.env.PERMITIR_DESLIGAR === '1',
    modo_demonstracao: process.env.MODO_DEMONSTRACAO === '1',
  }));
}
