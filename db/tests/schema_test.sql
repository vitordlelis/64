-- Autoteste do schema: psql -v ON_ERROR_STOP=1 -f db/schema.sql -f db/tests/schema_test.sql
BEGIN;
INSERT INTO admin (id, email, senha_hash, totp_secret) VALUES ('00000000-0000-0000-0000-000000000001','a@vl','x','y');
INSERT INTO cliente (id, nome) VALUES ('00000000-0000-0000-0000-0000000000c1','Cliente A');
INSERT INTO assinatura (cliente_id, valor_mensal_cent, inicio_em) VALUES ('00000000-0000-0000-0000-0000000000c1', 50000, current_date);
INSERT INTO assinatura (cliente_id, valor_mensal_cent, inicio_em, ciclo) VALUES ('00000000-0000-0000-0000-0000000000c1', 30000, current_date, 'anual');
INSERT INTO assinatura (cliente_id, valor_mensal_cent, inicio_em, status) VALUES ('00000000-0000-0000-0000-0000000000c1', 99900, current_date, 'cancelada');
DO $$ BEGIN ASSERT (SELECT mrr_cent FROM v_mrr) = 80000, 'MRR deveria ser 80000'; ASSERT (SELECT arr_cent FROM v_mrr) = 960000, 'ARR'; END $$;

INSERT INTO agente (id, nome, funcao, modelo) VALUES ('00000000-0000-0000-0000-0000000000a1','Helena','diretor','m');
-- gate: tarefa com ação não pode ser aprovada sem admin
DO $$ BEGIN
  BEGIN
    INSERT INTO tarefa (agente_id, origem, titulo, descricao, acao_tipo, status)
      VALUES ('00000000-0000-0000-0000-0000000000a1','autonoma','t','d','bloquear_ip','aprovada');
    RAISE EXCEPTION 'gate falhou: aprovou sem admin';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
INSERT INTO tarefa (agente_id, origem, titulo, descricao, acao_tipo, status, aprovada_por)
  VALUES ('00000000-0000-0000-0000-0000000000a1','autonoma','t','d','bloquear_ip','aprovada','00000000-0000-0000-0000-000000000001');

-- auditoria é imutável
INSERT INTO log_auditoria (autor_tipo, acao) VALUES ('admin','login');
DO $$ BEGIN
  BEGIN DELETE FROM log_auditoria; RAISE EXCEPTION 'auditoria apagável';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'log_auditoria é somente inserção' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
\echo 'schema_test OK'
