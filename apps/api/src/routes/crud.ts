import type { FastifyInstance } from 'fastify';
import { q } from '../db.ts';
import { sincronizarGithub } from '../github.ts';
import { checarAgora } from '../jobs/uptime.ts';
import { sincronizarTrafego } from '../trafego.ts';

// Repositório ligado/alterado: verifica o GitHub na hora, sem esperar o ciclo de 10 min.
const verificarRepo = (tabela: string, r: { id?: string; github_repo?: string } | undefined) => {
  if (tabela === 'sistema' && r?.id && r.github_repo) void sincronizarGithub(r.id).catch(() => {});
};

const txt = { type: ['string', 'null'], maxLength: 2000 };
const data = { type: ['string', 'null'], format: 'date' };
const uuid = { type: 'string', format: 'uuid' };
const cent = { type: 'integer', minimum: 0 };

// Colunas graváveis por entidade. As chaves do schema são constantes, por isso podem entrar no SQL.
const ENTIDADES = {
  clientes: {
    tabela: 'cliente', obrigatorios: ['nome'],
    campos: {
      nome: { type: 'string', minLength: 1, maxLength: 200 }, documento: txt, email: txt, whatsapp: txt,
      canal_preferido: { enum: ['whatsapp', 'email'] }, status: { enum: ['ativo', 'inativo'] },
    },
  },
  sistemas: {
    tabela: 'sistema', obrigatorios: ['cliente_id', 'nome'],
    campos: {
      cliente_id: uuid, nome: { type: 'string', minLength: 1, maxLength: 200 },
      url: { type: ['string', 'null'], pattern: '^https?://', maxLength: 500 },
      health_url: { type: ['string', 'null'], pattern: '^https?://', maxLength: 500 }, waf_zona_id: txt, pentest_autorizado: { type: 'boolean' },
      github_repo: { type: ['string', 'null'], pattern: '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$', maxLength: 200 },
      cf_projeto: { type: ['string', 'null'], pattern: '^[a-z0-9-]{1,63}$' }, ga_propriedade: { type: ['string', 'null'], pattern: '^[0-9]{3,20}$' },
      hospedagem: txt, dominio: txt, dominio_expira_em: data, ssl_expira_em: data,
      credenciais_ref: txt, notas: txt, latencia_limite_ms: { type: 'integer', minimum: 100, maximum: 30000 },
    },
  },
  assinaturas: {
    tabela: 'assinatura', obrigatorios: ['cliente_id', 'inicio_em'],
    campos: {
      cliente_id: uuid, sistema_id: { type: ['string', 'null'], format: 'uuid' },
      valor_projeto_cent: cent, valor_mensal_cent: cent, ciclo: { enum: ['mensal', 'trimestral', 'anual'] },
      dia_vencimento: { type: 'integer', minimum: 1, maximum: 28 }, inicio_em: { type: 'string', format: 'date' },
      renovacao_em: data, status: { enum: ['ativa', 'pausada'] }, // cancelar tem rota própria
    },
  },
  modelos: {
    tabela: 'modelo_mensagem', obrigatorios: ['nome', 'canal', 'corpo', 'gatilho'],
    campos: {
      nome: { type: 'string', minLength: 1, maxLength: 200 }, canal: { enum: ['email', 'whatsapp'] }, assunto: txt,
      corpo: { type: 'string', minLength: 1, maxLength: 4000 }, wa_template_nome: txt, wa_template_status: { enum: ['pendente', 'aprovado', 'rejeitado', null] },
      gatilho: { enum: ['manual', 'dias_vencimento', 'fatura_gerada', 'pagamento_confirmado', 'assinatura_expirando', 'dominio_expirando', 'ssl_expirando', 'agendado'] },
      gatilho_dias: { type: ['integer', 'null'], minimum: -60, maximum: 365 }, horario_comercial: { type: 'boolean' }, exige_confirmacao: { type: 'boolean' },
      ativo: { type: 'boolean' }, proximo_envio_em: { type: ['string', 'null'], format: 'date-time' }, repeticao: { enum: ['nenhuma', 'semanal', 'mensal'] },
    },
  },
} as const;

export function crud(app: FastifyInstance) {
  for (const [rota, { tabela, campos, obrigatorios }] of Object.entries(ENTIDADES)) {
    const cols = Object.keys(campos);
    const body = { type: 'object', properties: campos, required: obrigatorios, additionalProperties: false };

    app.get(`/api/${rota}`, async (req) => {
      const filtro = Object.entries(req.query as Record<string, string>).filter(([k]) => cols.includes(k));
      const where = filtro.length ? 'where ' + filtro.map(([k], i) => `${k} = $${i + 1}`).join(' and ') : '';
      return q(`select * from ${tabela} ${where} order by criado_em desc`, filtro.map(([, v]) => v));
    });

    app.get<{ Params: { id: string } }>(`/api/${rota}/:id`, { schema: { params: { type: 'object', properties: { id: uuid } } } },
      async (req, rep) => (await q(`select * from ${tabela} where id = $1`, [req.params.id]))[0] ?? rep.code(404).send({ erro: 'não encontrado' }));

    app.post<{ Body: Record<string, unknown> }>(`/api/${rota}`, { schema: { body } }, async (req, rep) => {
      const ks = Object.keys(req.body);
      const [r] = await q(`insert into ${tabela} (${ks.join(',')}) values (${ks.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(req.body));
      verificarRepo(tabela, r);
      if (tabela === 'sistema' && r.url) void checarAgora(r.id).catch(() => {}); // primeira medição já, sem esperar 1 min
      if (tabela === 'sistema' && (r.cf_projeto || r.ga_propriedade)) void sincronizarTrafego(r.id).catch(() => {});
      return rep.code(201).send(r);
    });

    app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(`/api/${rota}/:id`,
      { schema: { body: { ...body, required: [], minProperties: 1 }, params: { type: 'object', properties: { id: uuid } } } },
      async (req, rep) => {
        const ks = Object.keys(req.body);
        const [r] = await q(`update ${tabela} set ${ks.map((k, i) => `${k} = $${i + 2}`).join(',')} where id = $1 returning *`, [req.params.id, ...Object.values(req.body)]);
        if ('github_repo' in req.body) verificarRepo(tabela, r);
        if (r && ('cf_projeto' in req.body || 'ga_propriedade' in req.body)) void sincronizarTrafego(r.id).catch(() => {});
        return r ?? rep.code(404).send({ erro: 'não encontrado' });
      });
  }

  app.post<{ Params: { id: string } }>('/api/assinaturas/:id/cancelar', async (req, rep) => {
    const [r] = await q("update assinatura set status = 'cancelada', cancelado_em = current_date where id = $1 and status <> 'cancelada' returning *", [req.params.id]);
    return r ?? rep.code(409).send({ erro: 'assinatura inexistente ou já cancelada' });
  });
}
