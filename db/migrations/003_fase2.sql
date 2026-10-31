-- Fase 2: aprovações/executor, mensagens automáticas e SOC N1.

-- Tarefas também podem nascer do sistema (regras do SOC, gatilhos de mensagem) ou do admin, sem agente.
ALTER TABLE tarefa ALTER COLUMN agente_id DROP NOT NULL;
ALTER TABLE tarefa ADD COLUMN motivo_rejeicao text;

-- Envio de um lote rejeitado fica 'cancelada'.
ALTER TABLE envio_mensagem DROP CONSTRAINT envio_mensagem_status_check;
ALTER TABLE envio_mensagem ADD CONSTRAINT envio_mensagem_status_check
  CHECK (status IN ('pendente','enviada','entregue','lida','falhou','cancelada'));
CREATE INDEX ON envio_mensagem (tarefa_id);

-- Agendamento simples no lugar de cron: próxima data + repetição.
ALTER TABLE modelo_mensagem ADD COLUMN proximo_envio_em timestamptz;
ALTER TABLE modelo_mensagem ADD COLUMN repeticao text NOT NULL DEFAULT 'nenhuma' CHECK (repeticao IN ('nenhuma','semanal','mensal'));

-- Bloqueios de IP aplicados pelo Executor (com expiração).
CREATE TABLE bloqueio_ip (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id    uuid NOT NULL REFERENCES sistema(id),
  ip            inet NOT NULL,
  tarefa_id     uuid REFERENCES tarefa(id),
  waf_regra_id  text,                       -- id da regra no Cloudflare; NULL em modo demonstração
  expira_em     timestamptz NOT NULL,
  removido_em   timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bloqueio_ativo_unico ON bloqueio_ip (sistema_id, ip) WHERE removido_em IS NULL;

-- A equipe de agentes (a Fase 3 dá vida a eles; aqui já assinam as propostas do SOC e de marketing).
INSERT INTO agente (nome, funcao, modelo, teto_custo_dia_cent) VALUES
  ('Helena',    'diretor',    'claude-sonnet-5-5', 2000),
  ('Marcos',    'marketing',  'claude-sonnet-5-5', 1000),
  ('Lara',      'designer',   'claude-sonnet-5-5', 1000),
  ('Rafael',    'engenheiro', 'claude-opus-5-5',   3000),
  ('Vigia',     'soc',        'claude-haiku-5-5',  1000),
  ('Sentinela', 'pentester',  'claude-sonnet-5-5', 2000);

-- Modelos de mensagem prontos (editáveis). E-mail por padrão: WhatsApp exige template aprovado na Meta.
INSERT INTO modelo_mensagem (nome, canal, assunto, corpo, gatilho, gatilho_dias) VALUES
  ('Lembrete de vencimento', 'email', 'Sua mensalidade vence em {data_vencimento}',
   'Olá, {nome_cliente}! Lembrando que a mensalidade de {nome_sistema} no valor de {valor} vence em {data_vencimento}. Pague por aqui: {link_pagamento}', 'dias_vencimento', -3),
  ('Aviso de atraso', 'email', 'Mensalidade em aberto',
   'Olá, {nome_cliente}. Não identificamos o pagamento de {valor} de {nome_sistema}, vencido em {data_vencimento}. Se já pagou, desconsidere. Link: {link_pagamento}', 'dias_vencimento', 2),
  ('Confirmação de pagamento', 'email', 'Pagamento recebido',
   'Olá, {nome_cliente}! Recebemos seu pagamento de {valor} referente a {nome_sistema}. Obrigado!', 'pagamento_confirmado', NULL),
  ('Renovação de assinatura', 'email', 'Sua assinatura renova em breve',
   'Olá, {nome_cliente}! A assinatura de {nome_sistema} renova em {data_vencimento}. Qualquer dúvida, é só responder.', 'assinatura_expirando', 15),
  ('Vencimento de domínio', 'email', 'Domínio de {nome_sistema} vence em breve',
   'Olá, {nome_cliente}! O domínio de {nome_sistema} vence em {data_vencimento}. Vamos cuidar da renovação.', 'dominio_expirando', 30);

-- Variáveis usadas em cada envio (o WhatsApp precisa delas separadas para o template).
ALTER TABLE envio_mensagem ADD COLUMN variaveis jsonb NOT NULL DEFAULT '{}';
