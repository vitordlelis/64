import type { FastifyInstance } from 'fastify';
import { q } from './db.ts';

type Registro = {
  autor_tipo: 'admin' | 'agente' | 'executor' | 'sistema' | 'webhook';
  autor_id?: string | null; acao: string; entidade?: string | null; entidade_id?: string | null;
  contexto?: object; ip?: string | null;
};
export async function registrar(r: Registro) {
  await q(
    'insert into log_auditoria (autor_tipo, autor_id, acao, entidade, entidade_id, contexto, ip) values ($1,$2,$3,$4,$5,$6,$7)',
    [r.autor_tipo, r.autor_id ?? null, r.acao, r.entidade ?? null, r.entidade_id ?? null, r.contexto ?? {}, r.ip ?? null],
  );
}

// Toda escrita bem-sucedida na API vira uma linha de auditoria.
// shortcut: gravado após a resposta, não na mesma transação; se o insert falhar fica só no log de erro. Mover para transação se a auditoria virar requisito legal.
export function auditarEscritas(app: FastifyInstance) {
  app.addHook('onResponse', async (req, rep) => {
    if (req.method === 'GET' || rep.statusCode >= 400 || !req.url.startsWith('/api/')) return;
    if (req.url.startsWith('/api/auth/') || req.url.startsWith('/api/sonda/')) return; // login tem registro próprio; sonda é ruído
    const { senha: _s, codigo: _c, ...corpo } = (req.body ?? {}) as Record<string, unknown>;
    const rota = req.routeOptions.url ?? req.url;
    await registrar({
      autor_tipo: req.adminId ? 'admin' : 'webhook', autor_id: req.adminId, acao: `${req.method} ${rota}`,
      entidade: rota.split('/')[2], entidade_id: (req.params as { id?: string })?.id, contexto: corpo, ip: req.ip,
    }).catch((e) => req.log.error(e, 'falha ao gravar auditoria'));
  });
}
