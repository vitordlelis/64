import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { conectarGithub, detectarUrl, ErroGithub, gh, sincronizarGithub, tokenGithub } from '../github.ts';
import { checarAgora } from '../jobs/uptime.ts';

const CLIENTE_INTERNO = 'VL Systems (meus sistemas)';

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

  // Importa vários repositórios de uma vez. Sem cliente escolhido, entram no cliente interno "VL Systems (meus sistemas)".
  app.post<{ Body: { itens: { repo: string; url?: string | null; cliente_id?: string | null }[] } }>('/api/github/importar', {
    schema: { body: { type: 'object', required: ['itens'], properties: { itens: { type: 'array', minItems: 1, maxItems: 100, items: {
      type: 'object', required: ['repo'], additionalProperties: false, properties: {
        repo: { type: 'string', pattern: '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' },
        url: { anyOf: [{ type: 'string', pattern: '^https?://', maxLength: 500 }, { type: 'string', maxLength: 0 }, { type: 'null' }] },
        cliente_id: { type: ['string', 'null'], format: 'uuid' },
      } } } } } },
  }, async (req, rep) => {
    const token = await tokenGithub();
    if (!token) return rep.code(409).send({ erro: 'Conecte o GitHub em Configurações primeiro.' });
    let interno: string | undefined;
    let importados = 0, semEndereco = 0;
    for (const it of req.body.itens) {
      if ((await q('select 1 from sistema where github_repo = $1', [it.repo])).length) continue; // já importado
      const url = it.url?.trim() || (await detectarUrl(it.repo, token).catch(() => null));
      let cliente = it.cliente_id;
      if (!cliente) {
        interno ??= (await q('select id from cliente where nome = $1', [CLIENTE_INTERNO]))[0]?.id
          ?? (await q('insert into cliente (nome) values ($1) returning id', [CLIENTE_INTERNO]))[0].id;
        cliente = interno;
      }
      const [s] = await q('insert into sistema (cliente_id, nome, url, github_repo) values ($1, $2, $3, $4) returning id',
        [cliente, it.repo.split('/')[1], url || null, it.repo]);
      importados++;
      if (url) void checarAgora(s.id).catch(() => {}); else semEndereco++;
    }
    void sincronizarGithub().catch(() => {});
    return { importados, sem_endereco: semEndereco };
  });
}
