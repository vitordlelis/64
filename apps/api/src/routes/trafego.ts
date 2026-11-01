import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { conectarCloudflare, contaCloudflare, projetosPages } from '../cloudflare.ts';
import { conectarGoogle } from '../google.ts';
import { sincronizarTrafego, variacaoSemanal } from '../trafego.ts';
import { checarAgora } from '../jobs/uptime.ts';
import { CLIENTE_INTERNO } from './github.ts';

const uuid = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } };
const falha = (e: unknown) => ({ erro: (e as Error).message });

export function trafego(app: FastifyInstance) {
  // ---------- Cloudflare (nunca devolve o token) ----------
  app.get('/api/cloudflare', async () => {
    const [r] = await q("select dados, atualizado_em from integracao where nome = 'cloudflare'");
    return r ? { conectado: true, ...r.dados, desde: r.atualizado_em } : { conectado: false };
  });
  app.put<{ Body: { token: string } }>('/api/cloudflare', {
    schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 30, maxLength: 200, pattern: '^[A-Za-z0-9_-]+$' } } } },
  }, async (req, rep) => {
    try {
      const conta = await conectarCloudflare(req.body.token.trim());
      void sincronizarTrafego().catch(() => {});
      return { conectado: true, ...conta };
    } catch (e) { return rep.code(400).send(falha(e)); }
  });
  app.delete('/api/cloudflare', async () => { await q("delete from integracao where nome = 'cloudflare'"); return { conectado: false }; });

  app.get('/api/cloudflare/projetos', async (_req, rep) => {
    const c = await contaCloudflare();
    if (!c) return rep.code(409).send({ erro: 'Cloudflare não conectado' });
    try {
      const ligados = await q('select id, nome, cf_projeto from sistema where cf_projeto is not null');
      return (await projetosPages(c.token, c.conta)).map((p) => ({ ...p, sistema: ligados.find((s) => s.cf_projeto === p.nome) ?? null }));
    } catch (e) { return rep.code(502).send(falha(e)); }
  });

  // Cria um sistema para cada projeto do Pages que ainda não está ligado a nenhum (cliente interno).
  app.post('/api/cloudflare/importar', async (_req, rep) => {
    const c = await contaCloudflare();
    if (!c) return rep.code(409).send({ erro: 'Cloudflare não conectado' });
    await sincronizarTrafego(); // liga primeiro os que já existem (mesmo repositório ou endereço)
    const ligados = new Set((await q('select cf_projeto from sistema where cf_projeto is not null')).map((s) => s.cf_projeto));
    let interno: string | undefined, importados = 0;
    for (const p of await projetosPages(c.token, c.conta)) {
      if (ligados.has(p.nome)) continue;
      interno ??= (await q('select id from cliente where nome = $1', [CLIENTE_INTERNO]))[0]?.id
        ?? (await q('insert into cliente (nome) values ($1) returning id', [CLIENTE_INTERNO]))[0].id;
      const url = `https://${p.dominios.find((d) => !d.endsWith('.pages.dev')) ?? p.subdominio}`;
      const repo = p.repo && !(await q('select 1 from sistema where github_repo = $1', [p.repo])).length ? p.repo : null;
      const [s] = await q(`insert into sistema (cliente_id, nome, url, cf_projeto, github_repo, hospedagem) values ($1, $2, $3, $4, $5, 'Cloudflare Pages') returning id`,
        [interno, p.nome, url, p.nome, repo]);
      void checarAgora(s.id).catch(() => {});
      importados++;
    }
    void sincronizarTrafego().catch(() => {});
    return { importados };
  });

  // ---------- Google Analytics (nunca devolve a chave) ----------
  app.get('/api/google', async () => {
    const [r] = await q("select dados, atualizado_em from integracao where nome = 'google'");
    return r ? { conectado: true, ...r.dados, desde: r.atualizado_em } : { conectado: false };
  });
  app.put<{ Body: { chave: string } }>('/api/google', {
    schema: { body: { type: 'object', required: ['chave'], properties: { chave: { type: 'string', minLength: 100, maxLength: 10_000 } } } },
  }, async (req, rep) => {
    try {
      const d = await conectarGoogle(req.body.chave);
      void sincronizarTrafego().catch(() => {});
      return { conectado: true, ...d };
    } catch (e) { return rep.code(400).send(falha(e)); }
  });
  app.delete('/api/google', async () => { await q("delete from integracao where nome = 'google'"); return { conectado: false }; });

  // ---------- leitura ----------
  app.post<{ Params: { id: string } }>('/api/sistemas/:id/trafego/atualizar', { schema: { params: uuid } }, async (req) => {
    await sincronizarTrafego(req.params.id);
    return (await q('select trafego, trafego_atualizado_em, cf_projeto, ga_propriedade from sistema where id = $1', [req.params.id]))[0];
  });

  // Resumo de todos os sistemas para a tela Tráfego.
  app.get('/api/trafego', async () => {
    const ss = await q(`select s.id, s.nome, s.url, s.cliente_id, c.nome as cliente, s.cf_projeto, s.ga_propriedade, s.trafego, s.trafego_atualizado_em
      from sistema s join cliente c on c.id = s.cliente_id order by s.nome`);
    return ss.map(({ trafego: t, ...s }) => {
      const ga = t?.ga && !t.ga.erro ? t.ga : null, fonte = ga ?? t?.cloudflare?.analytics ?? null;
      return {
        ...s, fonte: ga ? 'ga' : fonte ? 'cloudflare' : null, semana: fonte ? variacaoSemanal(fonte.dias ?? []) : null,
        dias: fonte?.dias ?? [], conversoes: ga?.totais.conversoes ?? null, agora: ga?.agora ?? null,
        deploy: t?.cloudflare?.deploy ?? null, erro: t?.ga?.erro ?? t?.cloudflare?.erro ?? null, dicas: t?.dicas ?? [],
      };
    });
  });
}
