import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { conectarGithub, ErroGithub, gh, sincronizarGithub, tokenGithub } from '../github.ts';

const uuid = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } };

export function github(app: FastifyInstance) {
  // Nunca devolve o token: só se está conectado e com qual conta.
  app.get('/api/github', async () => {
    const [r] = await q("select dados, atualizado_em from integracao where nome = 'github'");
    return r ? { conectado: true, ...r.dados, desde: r.atualizado_em } : { conectado: false };
  });

  app.put<{ Body: { token: string } }>('/api/github', {
    schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 20, maxLength: 300, pattern: '^[A-Za-z0-9_]+$' } } } },
  }, async (req, rep) => {
    try {
      const conta = await conectarGithub(req.body.token.trim());
      void sincronizarGithub().catch(() => {});
      return { conectado: true, ...conta };
    } catch (e) {
      return rep.code(400).send({ erro: e instanceof ErroGithub ? e.message : `não consegui falar com o GitHub (${(e as Error).message})` });
    }
  });

  app.delete('/api/github', async () => {
    await q("delete from integracao where nome = 'github'");
    return { conectado: false };
  });

  app.get('/api/github/repos', async (req, rep) => {
    const token = await tokenGithub();
    if (!token) return rep.code(409).send({ erro: 'GitHub não conectado' });
    try {
      const repos = await gh('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member', token);
      // shortcut: só os 100 repositórios com push mais recente; paginar se a conta tiver mais que isso.
      return (repos as Record<string, unknown>[]).map((r) => ({ nome: r.full_name, privado: r.private, homepage: r.homepage || null, descricao: r.description, push: r.pushed_at }));
    } catch (e) {
      return rep.code(502).send({ erro: (e as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/api/sistemas/:id/github/atualizar', { schema: { params: uuid } }, async (req, rep) => {
    if (!(await tokenGithub())) return rep.code(409).send({ erro: 'Conecte o GitHub em Configurações primeiro.' });
    await sincronizarGithub(req.params.id);
    return (await q('select github_status, github_atualizado_em from sistema where id = $1', [req.params.id]))[0];
  });
}
