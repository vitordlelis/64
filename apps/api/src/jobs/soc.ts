// SOC Nível 1 — regras determinísticas sobre os eventos enviados pelos sistemas (janela de 5 min).
import { q } from '../db.ts';
import { notificar } from '../notificar.ts';

type Regra = { tipo: string; sql: string; severidade: (n: number) => string; descricao: (n: number) => string; recomendacao: string; bloquear: boolean };
const JANELA = "ocorrido_em > now() - interval '5 minutes'";

export const REGRAS: Regra[] = [
  {
    tipo: 'forca_bruta', bloquear: true,
    sql: `select sistema_id, host(ip) as ip, count(*)::int as n from evento_bruto where tipo = 'login_falho' and ip is not null and ${JANELA} group by 1, 2 having count(*) >= 10`,
    severidade: (n) => (n >= 50 ? 'critica' : 'alta'),
    descricao: (n) => `${n} tentativas de login falhas em 5 minutos do mesmo IP`,
    recomendacao: 'Bloquear o IP temporariamente e verificar se alguma conta foi acessada. Considerar limite de tentativas/captcha no login.',
  },
  {
    tipo: 'varredura', bloquear: true,
    sql: `select sistema_id, host(ip) as ip, count(distinct caminho)::int as n from evento_bruto where tipo = 'http_4xx' and ip is not null and ${JANELA} group by 1, 2 having count(distinct caminho) >= 20`,
    severidade: () => 'media',
    descricao: (n) => `${n} endereços inexistentes acessados em 5 minutos (varredura de caminhos)`,
    recomendacao: 'Bloquear o IP e conferir se não há arquivos sensíveis expostos (.env, backups, /admin).',
  },
  {
    tipo: 'pico_requisicoes', bloquear: true,
    sql: `select sistema_id, host(ip) as ip, count(*)::int as n from evento_bruto where tipo = 'req' and ip is not null and ${JANELA} group by 1, 2 having count(*) >= 300`,
    severidade: () => 'alta',
    descricao: (n) => `${n} requisições em 5 minutos do mesmo IP`,
    recomendacao: 'Bloquear o IP ou aplicar limite de taxa no WAF; verificar se não é um parceiro legítimo (integração, robô de busca).',
  },
  {
    tipo: 'anomalia_erros', bloquear: false,
    sql: `select sistema_id, null as ip, count(*)::int as n from evento_bruto where tipo = 'http_5xx' and ${JANELA} group by 1 having count(*) >= 20`,
    severidade: () => 'alta',
    descricao: (n) => `${n} erros 5xx em 5 minutos`,
    recomendacao: 'Verificar logs do servidor e deploys recentes; pode ser falha da aplicação ou ataque explorando um erro.',
  },
];
// shortcut: limites fixos por regra; ajustar por sistema quando houver histórico suficiente para calibrar.

export async function rodarSoc() {
  for (const r of REGRAS) {
    for (const a of await q(r.sql)) {
      // não repete o mesmo alerta (sistema + tipo + IP) por 30 minutos
      const [novo] = await q(`insert into evento_seguranca (sistema_id, tipo, severidade, ip_origem, descricao, recomendacao, evidencias)
        select $1, $2, $3, $4::inet, $5, $6, $7 where not exists (
          select 1 from evento_seguranca where sistema_id = $1 and tipo = $2 and ip_origem is not distinct from $4::inet and detectado_em > now() - interval '30 minutes')
        returning id`, [a.sistema_id, r.tipo, r.severidade(a.n), a.ip, r.descricao(a.n), r.recomendacao, { contagem: a.n, janela_min: 5 }]);
      if (!novo) continue;
      const [s] = await q('select s.nome, c.nome as cliente from sistema s join cliente c on c.id = s.cliente_id where s.id = $1', [a.sistema_id]);
      const sev = r.severidade(a.n);
      await notificar('seguranca', sev === 'critica' ? 'critico' : sev === 'alta' ? 'aviso' : 'info',
        `Segurança — ${s.nome} (${s.cliente}): ${r.descricao(a.n)}${a.ip ? ` [${a.ip}]` : ''}`, '/seguranca');
      if (r.bloquear && a.ip) await proporBloqueio(a.sistema_id, a.ip, `${r.descricao(a.n)}. ${r.recomendacao}`);
    }
  }
}

export async function proporBloqueio(sistemaId: string, ip: string, motivo: string) {
  const [ja] = await q(`select 1 from bloqueio_ip where sistema_id = $1 and ip = $2::inet and removido_em is null
    union all select 1 from tarefa where acao_tipo = 'bloquear_ip' and status in ('aguardando','aprovada','executando')
      and acao_payload->>'sistema_id' = $1::text and acao_payload->>'ip' = host($2::inet)`, [sistemaId, ip]);
  if (ja) return;
  await q(`insert into tarefa (agente_id, sistema_id, origem, titulo, descricao, acao_tipo, acao_payload, impacto)
    values ((select id from agente where funcao = 'soc'), $1, 'evento', $2, $3, 'bloquear_ip', $4, 'alto')`,
    [sistemaId, `Bloquear IP ${ip} por 24 h`, motivo, { sistema_id: sistemaId, ip, horas: 24 }]);
  await notificar('tarefa_aguardando', 'aviso', `Aprovação pendente: bloquear IP ${ip}`, '/aprovacoes');
}
