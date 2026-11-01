import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { q } from './db.ts';
import { base32, cifra, decifra, hashSenha, novoToken, sha256, verificaSenha, verificaTotp } from './crypto.ts';
import { registrar } from './auditoria.ts';

declare module 'fastify' {
  interface FastifyRequest { adminId: string | null }
}

export const COOKIE = 'vlc_sessao';
const PUBLICAS = ['/api/auth/login', '/api/auth/primeiro-acesso', '/api/webhooks/', '/api/sonda/', '/api/ingest/', '/api/health'];

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
    await registrar({ autor_tipo: 'admin', autor_id: a.id, acao: 'login', ip: req.ip });
    return abrirSessao(rep, a.id);
  });

  // Primeiro acesso (só no modo local): sem nenhum admin cadastrado, cria o administrador único com 2FA.
  const primeiroAcessoAberto = async () =>
    process.env.PERMITIR_PRIMEIRO_ACESSO === '1' && !(await q('select 1 from admin limit 1')).length;

  app.get('/api/auth/primeiro-acesso', async () =>
    (await primeiroAcessoAberto()) ? { disponivel: true, segredo: base32(randomBytes(20)) } : { disponivel: false });

  app.post<{ Body: { email: string; senha: string; segredo: string; codigo: string } }>('/api/auth/primeiro-acesso', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', required: ['email', 'senha', 'segredo', 'codigo'], properties: {
      email: { type: 'string', format: 'email', maxLength: 200 }, senha: { type: 'string', minLength: 12, maxLength: 200 },
      segredo: { type: 'string', pattern: '^[A-Z2-7]{32}$' }, codigo: { type: 'string', pattern: '^[0-9]{6}$' },
    } } },
  }, async (req, rep) => {
    if (!(await primeiroAcessoAberto())) return rep.code(409).send({ erro: 'O administrador já foi criado. Faça login.' });
    const { email, senha, segredo, codigo } = req.body;
    // o código prova que o app autenticador foi configurado com este segredo antes de gravar
    if (!verificaTotp(segredo, codigo)) return rep.code(400).send({ erro: 'Código do autenticador não confere. Confira a chave no app e tente com um código novo.' });
    const [a] = await q(`insert into admin (email, senha_hash, totp_secret) select $1, $2, $3
      where not exists (select 1 from admin) returning id`, [email.trim().toLowerCase(), await hashSenha(senha), cifra(segredo)]);
    if (!a) return rep.code(409).send({ erro: 'O administrador já foi criado. Faça login.' });
    await registrar({ autor_tipo: 'admin', autor_id: a.id, acao: 'admin_criado_primeiro_acesso', ip: req.ip });
    return abrirSessao(rep, a.id);
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

async function abrirSessao(rep: FastifyReply, adminId: string) {
  const token = novoToken();
  await q("insert into sessao (token_hash, admin_id, expira_em) values ($1, $2, now() + interval '12 hours')", [sha256(token), adminId]);
  rep.setCookie(COOKIE, token, {
    httpOnly: true, sameSite: 'strict', path: '/', maxAge: 12 * 3600, secure: process.env.NODE_ENV === 'production',
  });
  return { ok: true };
}
