// Popula um banco VAZIO com dados de demonstração (para ver o painel funcionando localmente).
// Não roda se já houver clientes cadastrados. Nunca use em produção.
import { fileURLToPath } from 'node:url';
import { pool, q } from '../db.ts';
import { cifra, hashSenha } from '../crypto.ts';
import { gerarFaturas, marcarVencidas } from '../jobs/faturas.ts';
import { prepararLote, type Destinatario } from '../mensagens.ts';

export const DEMO = { email: 'demo@vlcommand.local', senha: 'demo-vl-command', segredo2fa: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };

const CLIENTES = [
  // nome, sistema, url, mensal (R$), projeto (R$), início, ciclo
  ['Padaria Sol', 'Site + pedidos online', 'https://example.com', 450, 8000, '2025-01-10', 'mensal'],
  ['Clínica Vida', 'Agendamento de consultas', 'https://example.org', 1200, 25000, '2025-03-05', 'mensal'],
  ['Auto Peças Rocha', 'Catálogo e estoque', 'https://example.net', 800, 15000, '2025-06-20', 'mensal'],
  ['Escola Aprender', 'Portal do aluno', 'https://www.iana.org', 2400, 30000, '2025-09-01', 'trimestral'],
  ['Imobiliária Lar', 'Site de imóveis', 'http://127.0.0.1:59999/fora-do-ar', 600, 12000, '2026-02-15', 'mensal'],
  ['Studio Fit', 'App de treinos', 'https://example.com/studio', 500, 9000, '2025-04-01', 'mensal'],
] as const;

export async function popularDemo() {
  if ((await q('select 1 from cliente limit 1')).length) return false;
  const [{ hoje }] = await q("select current_date::text as hoje");

  await q(`insert into admin (email, senha_hash, totp_secret) values ($1, $2, $3) on conflict (email) do nothing`,
    [DEMO.email, await hashSenha(DEMO.senha), cifra(DEMO.segredo2fa)]);

  for (const [nome, sistema, url, mensal, projeto, inicio, ciclo] of CLIENTES) {
    const [c] = await q(`insert into cliente (nome, documento, email, whatsapp) values ($1, '00000000000191', $2, '+5511999990000') returning id`,
      [nome, `contato@${nome.toLowerCase().replace(/[^a-z]/g, '')}.com.br`]);
    const [s] = await q(`insert into sistema (cliente_id, nome, url, hospedagem, dominio, dominio_expira_em, credenciais_ref)
      values ($1, $2, $3, 'VPS Hostinger', $4, current_date + 20 + (random() * 300)::int, 'Bitwarden > Clientes > ' || $5) returning id`,
      [c.id, sistema, url, new URL(url).hostname, nome]);
    const [a] = await q(`insert into assinatura (cliente_id, sistema_id, valor_mensal_cent, valor_projeto_cent, inicio_em, ciclo)
      values ($1, $2, $3, $4, $5, $6) returning id`, [c.id, s.id, mensal * 100, projeto * 100, inicio, ciclo]);
    await q(`insert into fatura (cliente_id, assinatura_id, tipo, valor_cent, competencia, vencimento, status, pago_em)
      values ($1, $2, 'projeto', $3, date_trunc('month', $4::date), $4, 'paga', $4::date + 3)`, [c.id, a.id, projeto * 100, inicio]);
  }

  // Faturas recorrentes mês a mês desde jan/2025 até o mês atual.
  for (const [m] of (await q(`select to_char(d, 'YYYY-MM-DD') from generate_series('2025-01-01'::date, date_trunc('month', current_date), interval '1 month') d`)).map(Object.values)) {
    await gerarFaturas(m as string);
  }
  // Studio Fit cancelou em agosto/2026 (aparece no churn).
  await q(`update assinatura set status = 'cancelada', cancelado_em = '2026-08-15' from cliente c where c.id = assinatura.cliente_id and c.nome = 'Studio Fit'`);
  await q(`update fatura set status = 'cancelada' from cliente c where c.id = fatura.cliente_id and c.nome = 'Studio Fit' and competencia > '2026-08-01'`);
  // Quase tudo pago alguns dias após o vencimento; Auto Peças Rocha com 2 meses em atraso.
  await q(`update fatura f set status = 'paga', pago_em = f.vencimento + (abs(hashtext(f.id::text)) % 5)
    from cliente c where c.id = f.cliente_id and f.status = 'aberta' and f.vencimento < $1::date - 5
      and not (c.nome = 'Auto Peças Rocha' and f.vencimento > $1::date - 70)`, [hoje]);
  await marcarVencidas();
  await q(`delete from notificacao`); // as notificações de "vencida" do histórico não interessam; criamos algumas abaixo

  await q(`insert into meta_receita (mes, valor_cent)
    select d, 550000 from generate_series(date_trunc('year', current_date), date_trunc('year', current_date) + interval '11 months', interval '1 month') d`);

  // Histórico de 24 h de uptime (um check a cada 10 min) para os gráficos já aparecerem.
  await q(`insert into check_saude (sistema_id, origem, ok, http_status, latencia_ms, erro, checado_em)
    select s.id, 'principal', s.url not like 'http://127.0.0.1%', case when s.url like 'http://127.0.0.1%' then null else 200 end,
      case when s.url like 'http://127.0.0.1%' then null else 150 + (random() * 400)::int end,
      case when s.url like 'http://127.0.0.1%' then 'ECONNREFUSED' end, now() - (n * interval '10 minutes')
    from sistema s cross join generate_series(1, 144) n`);
  await q(`insert into incidente (sistema_id, tipo, inicio_em, fim_em, descricao)
    select id, 'queda', now() - interval '6 days 3 hours', now() - interval '6 days 2 hours 35 minutes', 'fora do ar (HTTP 502)'
    from sistema where nome = 'Agendamento de consultas'`);
  await q(`insert into notificacao (tipo, severidade, titulo, link, criado_em) values
    ('pagamento', 'info', 'Pagamento recebido: Clínica Vida — R$ 1.200,00', '/faturas', now() - interval '2 days'),
    ('fatura_vencida', 'aviso', 'Fatura vencida: Auto Peças Rocha — R$ 800,00', '/faturas?status=vencida', now() - interval '1 day')`);
  return true;
}

// Fase 2: eventos de segurança, histórico de mensagens e uma aprovação pendente. Roda uma vez por banco de demonstração.
export async function popularDemoFase2() {
  const [demo] = await q('select 1 from admin where email = $1', [DEMO.email]);
  if (!demo || (await q('select 1 from envio_mensagem limit 1')).length) return false;
  const sis = async (nome: string) => (await q('select id from sistema where nome = $1', [nome]))[0]?.id;
  const clinica = await sis('Agendamento de consultas'), padaria = await sis('Site + pedidos online');
  // Ataque "ao vivo": o SOC detecta no próximo minuto e propõe bloquear o IP (203.0.113.x é faixa de documentação).
  await q(`insert into evento_bruto (sistema_id, tipo, ip, caminho, ocorrido_em)
    select $1, 'login_falho', '203.0.113.45', '/login', now() - (n * interval '5 seconds') from generate_series(1, 18) n`, [clinica]);
  await q(`insert into evento_seguranca (sistema_id, tipo, severidade, ip_origem, descricao, recomendacao, status, detectado_em) values
    ($1, 'varredura', 'media', '198.51.100.7', '34 endereços inexistentes acessados em 5 minutos (varredura de caminhos)', 'Bloquear o IP e conferir arquivos expostos.', 'resolvido', now() - interval '3 days'),
    ($1, 'anomalia_erros', 'alta', null, '27 erros 5xx em 5 minutos', 'Verificar logs e deploys recentes.', 'reconhecido', now() - interval '9 days')`, [padaria]);
  // Histórico de mensagens já enviadas.
  await q(`insert into envio_mensagem (modelo_id, cliente_id, canal, destino, conteudo, status, provedor_id, criado_em)
    select m.id, c.id, 'email', c.email, 'Olá, ' || c.nome || '! Recebemos seu pagamento. Obrigado!', s, 'demo-' || c.id, now() - interval '5 days'
    from modelo_mensagem m, cliente c, (values ('enviada'), ('entregue'), ('lida')) v(s)
    where m.nome = 'Confirmação de pagamento' and c.nome in ('Clínica Vida', 'Padaria Sol', 'Escola Aprender')
      and (c.nome, s) in (('Clínica Vida', 'lida'), ('Padaria Sol', 'entregue'), ('Escola Aprender', 'enviada'))`);
  // Uma cobrança de atraso esperando sua aprovação.
  const [m] = await q("select * from modelo_mensagem where nome = 'Aviso de atraso'");
  const dest = await q<Destinatario>(`select c.id as cliente_id, c.nome as nome_cliente, c.email, c.whatsapp, c.optout_email, c.optout_whatsapp,
      f.id as fatura_id, f.valor_cent, f.vencimento::text as data, 'Catálogo e estoque' as nome_sistema, f.link_pagamento
    from fatura f join cliente c on c.id = f.cliente_id where f.status = 'vencida'`);
  await prepararLote(m, dest, 'evento');
  return true;
}

// Fase 3: histórico de exemplo dos agentes (para a tela não ficar vazia sem a chave da API).
export async function popularDemoFase3() {
  const [demo] = await q('select 1 from admin where email = $1', [DEMO.email]);
  if (!demo || (await q('select 1 from atividade_agente limit 1')).length) return false;
  const ag = async (f: string) => (await q('select id from agente where funcao = $1', [f]))[0].id as string;
  const [helena, lara, rafael, marcos] = [await ag('diretor'), await ag('designer'), await ag('engenheiro'), await ag('marketing')];
  const sis = async (nome: string) => (await q('select id from sistema where nome = $1', [nome]))[0]?.id;
  await q(`insert into atividade_agente (agente_id, tipo, resumo, tokens_entrada, tokens_saida, custo_usd, criado_em) values
    ($1, 'ciclo', 'Resumo do dia: MRR de R$ 5.450, inadimplência de 2% (Auto Peças Rocha com 2 faturas). Imobiliária Lar fora do ar desde ontem — pedi ao Rafael para investigar. Um bloqueio de IP aguarda sua aprovação.', 18000, 1400, 0.1, now() - interval '3 hours'),
    ($2, 'ciclo', 'Analisei 2 sites e registrei 1 recomendação de acessibilidade para o Site + pedidos online.', 25000, 1800, 0.136, now() - interval '2 days'),
    ($3, 'comando', 'Investiguei a queda do Site de imóveis: conexão recusada na porta do servidor. Registrei recomendação com os passos.', 12000, 1500, 0.078, now() - interval '2 hours'),
    ($4, 'ciclo', 'Revisei cobranças: só a Auto Peças Rocha está em atraso; o aviso já está na fila de aprovação.', 9000, 700, 0.05, now() - interval '1 day')`,
    [helena, lara, rafael, marcos]);
  await q(`insert into tarefa (agente_id, sistema_id, origem, titulo, descricao) values
    ($1, $3, 'autonoma', 'Melhorar contraste e tamanho dos botões do pedido online', 'O botão "Finalizar pedido" tem contraste 2,9:1 (o mínimo é 4,5:1) e altura de 32px no celular. Sugestão: fundo #b45309 com texto branco e altura mínima de 44px.'),
    ($2, $4, 'diretor', 'Site de imóveis fora do ar: reiniciar serviço e ativar reinício automático', 'O servidor recusa conexões (ECONNREFUSED) desde ontem. Passos: 1) acessar o VPS; 2) systemctl status do serviço web; 3) reiniciar; 4) configurar restart=always no systemd para evitar novas quedas.')`,
    [lara, rafael, await sis('Site + pedidos online'), await sis('Site de imóveis')]);
  await q(`update agente set estado = 'aguardando' where id in ($1, $2)`, [lara, rafael]);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log((await popularDemo())
    ? `Dados de demonstração criados.\n  Login: ${DEMO.email}\n  Senha: ${DEMO.senha}\n  2FA (cadastre no app autenticador): ${DEMO.segredo2fa}`
    : 'Banco já tem clientes; demonstração da Fase 1 não aplicada.');
  if (await popularDemoFase2()) console.log('Dados de demonstração da Fase 2 criados.');
  if (await popularDemoFase3()) console.log('Dados de demonstração da Fase 3 criados.');
  await pool.end();
}
