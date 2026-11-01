// Remove, uma única vez, os dados de demonstração das versões anteriores do modo local.
// Só age se o usuário demo ainda existir; o que o próprio usuário cadastrou é preservado.
// (log_auditoria é imutável e fica como está.)
import { fileURLToPath } from 'node:url';
import { pool } from '../db.ts';

const EMAIL_DEMO = 'demo@vlcommand.local';
const DOC_DEMO = '00000000000191'; // CPF/CNPJ usado em todos os clientes fictícios

export async function limparDemo() {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const { rows: [demo] } = await c.query('select id from admin where email = $1', [EMAIL_DEMO]);
    if (!demo) { await c.query('rollback'); return false; }
    await c.query(`
      create temp table d_cli on commit drop as select id from cliente where documento = '${DOC_DEMO}';
      create temp table d_sis on commit drop as select id from sistema where cliente_id in (select id from d_cli);
      create temp table d_tar on commit drop as select id from tarefa
        where sistema_id in (select id from d_sis)
           or id in (select tarefa_id from envio_mensagem where cliente_id in (select id from d_cli))
           or agente_id is not null                -- tudo dos agentes: sem chave de IA, era exemplo ou teste
           or aprovada_por = '${demo.id}';         -- testes aprovados com o usuário demo (seguem registrados na auditoria)
      update agente set tarefa_atual_id = null, estado = 'ocioso', ultimo_ciclo_em = null;
      delete from atividade_agente;
      delete from bloqueio_ip where sistema_id in (select id from d_sis) or tarefa_id in (select id from d_tar);
      delete from relatorio_pentest where sistema_id in (select id from d_sis) or tarefa_id in (select id from d_tar);
      delete from envio_mensagem where cliente_id in (select id from d_cli) or tarefa_id in (select id from d_tar);
      delete from tarefa where id in (select id from d_tar)
        or (acao_tipo = 'enviar_mensagens' and not exists (select 1 from envio_mensagem e where e.tarefa_id = tarefa.id));
      delete from evento_seguranca where sistema_id in (select id from d_sis);
      delete from evento_bruto where sistema_id in (select id from d_sis);
      delete from check_saude where sistema_id in (select id from d_sis);
      delete from incidente where sistema_id in (select id from d_sis);
      delete from fatura where cliente_id in (select id from d_cli);
      delete from assinatura where cliente_id in (select id from d_cli);
      delete from sistema where id in (select id from d_sis);
      delete from cliente where id in (select id from d_cli);
      delete from meta_receita where valor_cent = 550000;  -- metas de exemplo (R$ 5.500/mês)
      delete from notificacao;`);
    await c.query('delete from admin where id = $1', [demo.id]); // sessões caem junto (on delete cascade)
    await c.query('commit');
    return true;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (await limparDemo()) console.log('Dados de demonstração removidos.');
  await pool.end();
}
