import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { q } from './db.ts';
import { auth } from './auth.ts';
import { auditarEscritas } from './auditoria.ts';
import { crud } from './routes/crud.ts';
import { faturas } from './routes/faturas.ts';
import { financeiro } from './routes/financeiro.ts';
import { saude } from './routes/saude.ts';
import { admin } from './routes/admin.ts';
import { externos } from './routes/externos.ts';

const WEB = fileURLToPath(new URL('../../web/dist/', import.meta.url));

export async function criarApp() {
  // trustProxy: a app só é exposta atrás do Caddy (docker-compose), então o X-Forwarded-For é confiável.
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', trustProxy: true, bodyLimit: 1024 * 1024 });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  auth(app);
  auditarEscritas(app);
  app.get('/api/health', async () => { await q('select 1'); return { ok: true }; });
  for (const rotas of [crud, faturas, financeiro, saude, admin, externos]) rotas(app);

  if (existsSync(WEB)) {
    await app.register(fastifyStatic, { root: WEB });
    app.setNotFoundHandler((req, rep) =>
      ['GET', 'HEAD'].includes(req.method) && !req.url.startsWith('/api/') ? rep.sendFile('index.html') : rep.code(404).send({ erro: 'não encontrado' }));
  }
  return app;
}
