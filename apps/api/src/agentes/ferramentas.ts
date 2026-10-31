// Ferramentas por papel. Leitura: consultas ao banco ou GET em sistemas cadastrados.
// Escrita: apenas propostas/registros internos que passam pela tela de Aprovações.
import { q } from '../db.ts';
import { resumoFinanceiro } from '../routes/financeiro.ts';
import { prepararLote, DEST_MANUAL, type Destinatario } from '../mensagens.ts';
import { proporBloqueio } from '../jobs/soc.ts';
import { acaoValida } from '../acoes.ts';
import { notificar } from '../notificar.ts';
import type { Ferramenta } from './ia.ts';

type Ctx = { agenteId: string; funcao: string; nome: string };
type Def = { def: Ferramenta; rodar: (e: Record<string, any>, c: Ctx) => Promise<unknown> }; // eslint-disable-line @typescript-eslint/no-explicit-any

const obj = (properties: Record<string, object>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });
// Conteúdo vindo de fora (páginas, logs) é marcado para o modelo não seguir instruções contidas nele.
const naoConfiavel = (s: string) => `<conteudo_nao_confiavel>\n${s}\n</conteudo_nao_confiavel>`;

async function registrarRecomendacao(c: Ctx, titulo: string, descricao: string, sistemaId?: string) {
  const [dup] = await q("select 1 from tarefa where agente_id = $1 and titulo = $2 and status = 'aguardando'", [c.agenteId, titulo]);
  if (dup) return 'Já existe uma recomendação pendente com esse título.';
  await q(`insert into tarefa (agente_id, sistema_id, origem, titulo, descricao) values ($1, $2, 'autonoma', $3, $4)`, [c.agenteId, sistemaId ?? null, titulo, descricao]);
  return 'Recomendação registrada; aguarda o administrador em Aprovações.';
}

const F: Record<string, Def> = {
  resumo_financeiro: {
    def: { name: 'resumo_financeiro', description: 'Indicadores financeiros do ano (valores em centavos de real): MRR, ARR, receita do mês x meta, inadimplência, por cliente.', input_schema: obj({}) },
    rodar: async () => { const { mensal: _m, previsao: _p, ...r } = await resumoFinanceiro(new Date().getFullYear()); return r; },
  },
  listar_sistemas: {
    def: { name: 'listar_sistemas', description: 'Sistemas dos clientes com status de saúde, uptime 24h, última latência e vencimentos de SSL/domínio.', input_schema: obj({}) },
    rodar: () => q(`select s.id, s.nome, c.nome as cliente, s.url, s.status_saude, s.ssl_expira_em, s.dominio_expira_em,
      (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from check_saude k where k.sistema_id = s.id and k.checado_em > now() - interval '24 hours') as uptime_24h,
      (select latencia_ms from check_saude k where k.sistema_id = s.id order by checado_em desc limit 1) as latencia_ms
      from sistema s join cliente c on c.id = s.cliente_id where c.status = 'ativo' order by c.nome`),
  },
  tarefas_recentes: {
    def: { name: 'tarefas_recentes', description: 'Últimas 30 tarefas/propostas de todos os agentes e seus status (para não repetir propostas).', input_schema: obj({}) },
    rodar: () => q(`select t.titulo, t.status, t.origem, a.nome as agente, t.criada_em from tarefa t left join agente a on a.id = t.agente_id
      where t.status <> 'rascunho' order by t.criada_em desc limit 30`),
  },
  incidentes: {
    def: { name: 'incidentes', description: 'Incidentes (quedas, lentidão, SSL, domínio) dos últimos 30 dias.', input_schema: obj({}) },
    rodar: () => q(`select i.tipo, i.inicio_em, i.fim_em, i.descricao, s.nome as sistema, s.id as sistema_id from incidente i join sistema s on s.id = i.sistema_id
      where i.inicio_em > now() - interval '30 days' order by i.inicio_em desc limit 50`),
  },
  eventos_seguranca: {
    def: { name: 'eventos_seguranca', description: 'Últimos 50 eventos de segurança (SOC).', input_schema: obj({}) },
    rodar: () => q(`select e.id, e.tipo, e.severidade, host(e.ip_origem) as ip, e.descricao, e.status, e.detectado_em, s.nome as sistema, s.id as sistema_id
      from evento_seguranca e join sistema s on s.id = e.sistema_id order by e.detectado_em desc limit 50`),
  },
  historico_ip: {
    def: { name: 'historico_ip', description: 'Tudo o que um IP fez nas últimas 24 h (eventos brutos por tipo e sistema), alertas e bloqueios.', input_schema: obj({ ip: str('Endereço IP') }, ['ip']) },
    rodar: async ({ ip }) => ({
      eventos_24h: await q(`select s.nome as sistema, b.tipo, count(*)::int as total, min(b.ocorrido_em) as primeiro, max(b.ocorrido_em) as ultimo,
        array_agg(distinct b.caminho) filter (where b.caminho is not null) as caminhos
        from evento_bruto b join sistema s on s.id = b.sistema_id where b.ip = $1::inet and b.ocorrido_em > now() - interval '24 hours' group by 1, 2`, [ip]),
      alertas: await q('select tipo, severidade, descricao, detectado_em from evento_seguranca where ip_origem = $1::inet order by detectado_em desc limit 20', [ip]),
      bloqueios: await q('select expira_em, removido_em from bloqueio_ip where ip = $1::inet', [ip]),
    }),
  },
  faturas_em_aberto: {
    def: { name: 'faturas_em_aberto', description: 'Faturas abertas ou vencidas (valores em centavos de real).', input_schema: obj({}) },
    rodar: () => q(`select f.id, c.nome as cliente, c.id as cliente_id, f.tipo, f.valor_cent, f.vencimento, f.status from fatura f join cliente c on c.id = f.cliente_id
      where f.status in ('aberta','vencida') order by f.vencimento limit 100`),
  },
  listar_clientes: {
    def: { name: 'listar_clientes', description: 'Clientes com status e canais disponíveis (sem dados pessoais).', input_schema: obj({}) },
    rodar: () => q(`select id, nome, status, canal_preferido, email is not null as tem_email, whatsapp is not null as tem_whatsapp, optout_email, optout_whatsapp from cliente order by nome`),
  },
  historico_mensagens: {
    def: { name: 'historico_mensagens', description: 'Mensagens enviadas aos clientes nos últimos 60 dias, por modelo e status.', input_schema: obj({}) },
    rodar: () => q(`select m.nome as modelo, e.status, count(*)::int as total, max(e.criado_em) as ultimo from envio_mensagem e left join modelo_mensagem m on m.id = e.modelo_id
      where e.criado_em > now() - interval '60 days' group by 1, 2 order by 4 desc`),
  },
  listar_modelos_mensagem: {
    def: { name: 'listar_modelos_mensagem', description: 'Modelos de mensagem existentes (id, nome, canal, gatilho, texto).', input_schema: obj({}) },
    rodar: () => q('select id, nome, canal, gatilho, corpo, ativo from modelo_mensagem order by nome'),
  },
  buscar_pagina: {
    def: { name: 'buscar_pagina', description: 'Baixa a página pública de um sistema CADASTRADO (pelo id) e devolve status, cabeçalhos, título e texto. Só funciona para sistemas da lista.', input_schema: obj({ sistema_id: str('id do sistema') }, ['sistema_id']) },
    rodar: async ({ sistema_id }) => {
      const [s] = await q('select url from sistema where id = $1', [sistema_id]);
      if (!s) throw new Error('sistema não cadastrado');
      const t0 = performance.now();
      const r = await fetch(s.url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'VL-Command-Agente/1.0' } });
      const html = (await r.text()).slice(0, 200_000);
      const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 8000);
      return {
        status: r.status, tempo_ms: Math.round(performance.now() - t0), bytes_html: html.length,
        cabecalhos: Object.fromEntries([...r.headers].filter(([k]) => /server|cache|content-type|security|x-/.test(k))),
        titulo: html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim(), imagens: (html.match(/<img/gi) ?? []).length,
        scripts: (html.match(/<script/gi) ?? []).length, texto: naoConfiavel(texto),
      };
    },
  },
  ler_relatorio_pentest: {
    def: { name: 'ler_relatorio_pentest', description: 'Lê um relatório de pen test passivo.', input_schema: obj({ relatorio_id: str('id do relatório') }, ['relatorio_id']) },
    rodar: async ({ relatorio_id }) => (await q('select r.resumo, r.achados, s.nome as sistema, s.url from relatorio_pentest r join sistema s on s.id = r.sistema_id where r.id = $1', [relatorio_id]))[0] ?? 'não encontrado',
  },

  // ---------- propostas e registros (nada disso age fora do VL Command) ----------
  registrar_recomendacao: {
    def: { name: 'registrar_recomendacao', description: 'Registra uma recomendação para o administrador (vai para Aprovações). Use para melhorias, correções e observações importantes.', input_schema: obj({
      titulo: str('Título curto e específico'), descricao: str('O que fazer, por quê, e os passos concretos'), sistema_id: str('id do sistema relacionado, se houver'),
    }, ['titulo', 'descricao']) },
    rodar: (e, c) => registrarRecomendacao(c, String(e.titulo).slice(0, 200), String(e.descricao).slice(0, 4000), e.sistema_id || undefined),
  },
  propor_envio_mensagens: {
    def: { name: 'propor_envio_mensagens', description: 'Propõe enviar um modelo de mensagem para clientes. O administrador vê cada mensagem antes de aprovar.', input_schema: obj({
      modelo_id: str('id do modelo'), cliente_ids: { type: 'array', items: { type: 'string' }, description: 'ids dos clientes' }, justificativa: str('Por que enviar agora'),
    }, ['modelo_id', 'cliente_ids', 'justificativa']) },
    rodar: async (e) => {
      const [m] = await q('select * from modelo_mensagem where id = $1', [e.modelo_id]);
      if (!m) throw new Error('modelo inexistente');
      const lote = await prepararLote({ ...m, exige_confirmacao: true }, await q<Destinatario>(DEST_MANUAL, [e.cliente_ids]), 'autonoma');
      if (!lote) return 'Nenhum destinatário válido (sem contato, opt-out ou já recebeu).';
      await q("update tarefa set descricao = $2 || ' ' || descricao where id = $1", [lote.tarefa_id, String(e.justificativa).slice(0, 1000)]);
      return `Proposta criada para ${lote.total} cliente(s); aguarda aprovação.`;
    },
  },
  propor_bloqueio_ip: {
    def: { name: 'propor_bloqueio_ip', description: 'Propõe bloquear UM IP em um sistema por algumas horas (aguarda aprovação com 2FA). Nunca faixas.', input_schema: obj({
      sistema_id: str('id do sistema'), ip: str('IP único'), horas: { type: 'integer', description: '1 a 720' }, justificativa: str('Evidências'),
    }, ['sistema_id', 'ip', 'horas', 'justificativa']) },
    rodar: async (e) => {
      if (!acaoValida('bloquear_ip', { sistema_id: e.sistema_id, ip: e.ip, horas: e.horas })) throw new Error('parâmetros inválidos (um IP, 1 a 720 horas)');
      return (await proporBloqueio(e.sistema_id, e.ip, String(e.justificativa).slice(0, 2000), e.horas)) ? 'Bloqueio proposto; aguarda aprovação.' : 'Já existe bloqueio ativo ou proposta pendente para esse IP.';
    },
  },
  registrar_analise_evento: {
    def: { name: 'registrar_analise_evento', description: 'Registra sua análise de um evento de segurança.', input_schema: obj({
      evento_id: str('id do evento'), analise: str('Sua avaliação: é ataque real? risco? o que fazer?'), provavel_falso_positivo: { type: 'boolean' },
    }, ['evento_id', 'analise', 'provavel_falso_positivo']) },
    rodar: async (e, c) => {
      await q(`update evento_seguranca set triado_em = now(), recomendacao = coalesce(recomendacao, '') || $2 where id = $1`,
        [e.evento_id, `\n\nAnálise de ${c.nome}${e.provavel_falso_positivo ? ' (provável falso positivo)' : ''}: ${String(e.analise).slice(0, 2000)}`]);
      return 'Análise registrada.';
    },
  },
  registrar_analise_pentest: {
    def: { name: 'registrar_analise_pentest', description: 'Registra a análise priorizada de um relatório de pen test, em linguagem simples.', input_schema: obj({ relatorio_id: str('id do relatório'), analise: str('Análise priorizada') }, ['relatorio_id', 'analise']) },
    rodar: async (e) => {
      await q(`update relatorio_pentest set resumo = resumo || E'\\n\\n' || $2 where id = $1`, [e.relatorio_id, String(e.analise).slice(0, 6000)]);
      return 'Análise registrada no relatório.';
    },
  },
  delegar: {
    def: { name: 'delegar', description: 'Pede uma tarefa a outro agente (marketing, designer, engenheiro, soc). Não tem efeito externo.', input_schema: obj({
      funcao: { type: 'string', enum: ['marketing', 'designer', 'engenheiro', 'soc'] }, instrucao: str('O que o agente deve analisar/propor'),
    }, ['funcao', 'instrucao']) },
    rodar: async (e) => {
      const [a] = await q('select id, nome from agente where funcao = $1 and ativo', [e.funcao]);
      if (!a) throw new Error('agente inexistente ou pausado');
      await q(`insert into tarefa (agente_id, origem, titulo, descricao, status) values ($1, 'diretor', $2, $3, 'rascunho')`,
        [a.id, `Pedido da diretora para ${a.nome}`, String(e.instrucao).slice(0, 2000)]);
      return `Pedido enviado para ${a.nome}.`;
    },
  },
  enviar_resumo: {
    def: { name: 'enviar_resumo', description: 'Envia o resumo do dia ao administrador (aparece em Notificações e na tela Agentes).', input_schema: obj({ texto: str('Resumo em até 10 linhas') }, ['texto']) },
    rodar: async (e, c) => {
      await notificar('resumo', 'info', `Resumo de ${c.nome}: ${String(e.texto).slice(0, 300)}`, '/agentes');
      return 'Resumo enviado.';
    },
  },
};

const LEITURA = ['resumo_financeiro', 'listar_sistemas', 'tarefas_recentes'];
const POR_FUNCAO: Record<string, string[]> = {
  diretor: [...LEITURA, 'incidentes', 'eventos_seguranca', 'faturas_em_aberto', 'delegar', 'enviar_resumo', 'registrar_recomendacao'],
  marketing: [...LEITURA, 'faturas_em_aberto', 'listar_clientes', 'historico_mensagens', 'listar_modelos_mensagem', 'propor_envio_mensagens', 'registrar_recomendacao'],
  designer: [...LEITURA, 'buscar_pagina', 'registrar_recomendacao'],
  engenheiro: [...LEITURA, 'incidentes', 'buscar_pagina', 'registrar_recomendacao'],
  soc: [...LEITURA, 'eventos_seguranca', 'historico_ip', 'registrar_analise_evento', 'propor_bloqueio_ip', 'registrar_recomendacao'],
  pentester: ['listar_sistemas', 'ler_relatorio_pentest', 'registrar_analise_pentest'],
};

export function ferramentasDe(c: Ctx) {
  const nomes = POR_FUNCAO[c.funcao] ?? LEITURA;
  return {
    defs: nomes.map((n) => F[n]!.def),
    executar: async (nome: string, entrada: Record<string, unknown>) => {
      if (!nomes.includes(nome)) throw new Error(`ferramenta ${nome} não permitida para ${c.funcao}`); // o papel limita o que o agente pode fazer
      const r = await F[nome]!.rodar(entrada, c);
      return typeof r === 'string' ? r : JSON.stringify(r);
    },
  };
}
