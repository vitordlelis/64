-- VL Command — modelo de dados (PostgreSQL 16)
-- Fonte da verdade do schema. Valores em dinheiro em centavos (bigint) para evitar erro de arredondamento.

-- gen_random_uuid() é nativo no PostgreSQL 13+.

-- ============ Acesso ============
CREATE TABLE admin (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  senha_hash    text NOT NULL,              -- Argon2id
  totp_secret   text NOT NULL,              -- cifrado na aplicação
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- ============ Clientes e sistemas ============
CREATE TABLE cliente (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  documento       text,                     -- CNPJ/CPF
  email           text,
  whatsapp        text,                     -- E.164, ex.: +5511999999999
  canal_preferido text NOT NULL DEFAULT 'whatsapp' CHECK (canal_preferido IN ('whatsapp','email')),
  optout_whatsapp boolean NOT NULL DEFAULT false,
  optout_email    boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sistema (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          uuid NOT NULL REFERENCES cliente(id),
  nome                text NOT NULL,
  url                 text NOT NULL,
  health_url          text,                 -- endpoint de health check; padrão = url
  hospedagem          text,                 -- provedor/servidor
  dominio             text,
  dominio_expira_em   date,
  ssl_expira_em       date,                 -- atualizado pelo worker de uptime
  credenciais_ref     text,                 -- referência ao cofre de senhas; NUNCA a senha em si
  notas               text,
  status_saude        text NOT NULL DEFAULT 'desconhecido'
                        CHECK (status_saude IN ('verde','amarelo','vermelho','desconhecido')),
  latencia_limite_ms  int  NOT NULL DEFAULT 1500, -- acima disso = amarelo
  chave_ingestao_hash text,                 -- hash da chave que o sistema usa para enviar eventos de segurança
  pentest_autorizado  boolean NOT NULL DEFAULT false,
  dominio_verificado_em timestamptz,        -- verificação DNS TXT; pré-requisito do pen test
  waf_zona_id         text,                 -- zona Cloudflare, se houver
  criado_em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sistema (cliente_id);

-- ============ Financeiro ============
CREATE TABLE assinatura (                   -- "Contrato / Assinatura"
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           uuid NOT NULL REFERENCES cliente(id),
  sistema_id           uuid REFERENCES sistema(id),
  valor_projeto_cent   bigint NOT NULL DEFAULT 0 CHECK (valor_projeto_cent >= 0),  -- receita única
  valor_mensal_cent    bigint NOT NULL DEFAULT 0 CHECK (valor_mensal_cent >= 0),   -- receita recorrente, sempre por mês
  ciclo                text NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal','trimestral','anual')),
  dia_vencimento       int  NOT NULL DEFAULT 10 CHECK (dia_vencimento BETWEEN 1 AND 28),
  inicio_em            date NOT NULL,
  renovacao_em         date,
  cancelado_em         date,
  status               text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','cancelada')),
  criado_em            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON assinatura (cliente_id);

CREATE TABLE fatura (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES cliente(id),
  assinatura_id    uuid REFERENCES assinatura(id),
  tipo             text NOT NULL CHECK (tipo IN ('projeto','recorrente')),
  valor_cent       bigint NOT NULL CHECK (valor_cent > 0),
  competencia      date NOT NULL,           -- mês de referência (dia 1)
  vencimento       date NOT NULL,
  status           text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','vencida','cancelada')),
  pago_em          timestamptz,
  link_pagamento   text,
  gateway_id       text UNIQUE,             -- id no Asaas; idempotência do webhook
  criado_em        timestamptz NOT NULL DEFAULT now()
);
-- impede fatura recorrente duplicada no mesmo mês (fatura de projeto pode coexistir)
CREATE UNIQUE INDEX fatura_recorrente_unica ON fatura (assinatura_id, competencia) WHERE tipo = 'recorrente';
CREATE INDEX ON fatura (status, vencimento);
CREATE INDEX ON fatura (cliente_id);

CREATE TABLE meta_receita (
  mes        date PRIMARY KEY,              -- dia 1 do mês
  valor_cent bigint NOT NULL CHECK (valor_cent >= 0)
);

-- ============ Saúde (uptime) ============
CREATE TABLE check_saude (
  id           bigserial PRIMARY KEY,
  sistema_id   uuid NOT NULL REFERENCES sistema(id),
  origem       text NOT NULL DEFAULT 'principal' CHECK (origem IN ('principal','sonda_externa','webhook')),
  ok           boolean NOT NULL,
  http_status  int,
  latencia_ms  int,
  erro         text,
  checado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON check_saude (sistema_id, checado_em DESC);  -- retenção: 90 dias (job de limpeza)

CREATE TABLE incidente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id    uuid NOT NULL REFERENCES sistema(id),
  tipo          text NOT NULL CHECK (tipo IN ('queda','degradacao','ssl','dominio')),
  inicio_em     timestamptz NOT NULL DEFAULT now(),
  fim_em        timestamptz,                -- NULL = em andamento
  descricao     text
);
CREATE UNIQUE INDEX incidente_um_aberto ON incidente (sistema_id, tipo) WHERE fim_em IS NULL;

-- ============ Segurança (SOC N1) ============
CREATE TABLE evento_bruto (                 -- logs enviados pelos sistemas (login falho, 4xx/5xx, req/min)
  id          bigserial PRIMARY KEY,
  sistema_id  uuid NOT NULL REFERENCES sistema(id),
  tipo        text NOT NULL,                -- ex.: login_falho, http_4xx, http_5xx, req
  ip          inet,
  caminho     text,
  dados       jsonb NOT NULL DEFAULT '{}',
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON evento_bruto (sistema_id, ocorrido_em DESC);  -- retenção: 30 dias

CREATE TABLE evento_seguranca (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id    uuid NOT NULL REFERENCES sistema(id),
  tipo          text NOT NULL CHECK (tipo IN ('forca_bruta','pico_requisicoes','varredura','anomalia_erros','pentest_achado','outro')),
  severidade    text NOT NULL CHECK (severidade IN ('baixa','media','alta','critica')),
  ip_origem     inet,
  descricao     text NOT NULL,
  recomendacao  text,
  evidencias    jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','reconhecido','resolvido','falso_positivo')),
  detectado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON evento_seguranca (sistema_id, detectado_em DESC);

-- ============ Agentes de IA ============
CREATE TABLE agente (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL UNIQUE,    -- usado no comando de voz ("Helena, ...")
  funcao           text NOT NULL UNIQUE CHECK (funcao IN ('diretor','marketing','designer','engenheiro','soc','pentester')),
  modelo           text NOT NULL,           -- id do modelo Claude
  estado           text NOT NULL DEFAULT 'ocioso' CHECK (estado IN ('trabalhando','aguardando','ocioso')),
  tarefa_atual_id  uuid,                    -- FK adicionada abaixo
  ativo            boolean NOT NULL DEFAULT true,
  teto_custo_dia_cent bigint NOT NULL DEFAULT 2000,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tarefa (                       -- proposta de um agente
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id       uuid NOT NULL REFERENCES agente(id),
  sistema_id      uuid REFERENCES sistema(id),
  origem          text NOT NULL CHECK (origem IN ('autonoma','admin_texto','admin_voz','diretor','evento')),
  titulo          text NOT NULL,
  descricao       text NOT NULL,            -- análise e justificativa
  acao_tipo       text,                     -- catálogo fechado, ex.: enviar_mensagens, bloquear_ip, abrir_pr; NULL = só informativa
  acao_payload    jsonb,                    -- parâmetros validados pelo Executor
  impacto         text NOT NULL DEFAULT 'baixo' CHECK (impacto IN ('baixo','alto')),  -- alto = exige step-up TOTP
  status          text NOT NULL DEFAULT 'aguardando'
                    CHECK (status IN ('rascunho','aguardando','aprovada','rejeitada','executando','concluida','falhou','expirada')),
  aprovada_por    uuid REFERENCES admin(id),
  decidida_em     timestamptz,
  executada_em    timestamptz,
  resultado       jsonb,
  custo_ia_cent   bigint NOT NULL DEFAULT 0,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  expira_em       timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  -- o gate no banco: nada sai de 'aguardando' para execução sem admin registrado
  CHECK (status NOT IN ('aprovada','executando','concluida','falhou') OR acao_tipo IS NULL OR aprovada_por IS NOT NULL)
);
CREATE INDEX ON tarefa (status, criada_em DESC);
CREATE INDEX ON tarefa (agente_id, criada_em DESC);
ALTER TABLE agente ADD FOREIGN KEY (tarefa_atual_id) REFERENCES tarefa(id);

CREATE TABLE relatorio_pentest (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   uuid NOT NULL REFERENCES tarefa(id),
  sistema_id  uuid NOT NULL REFERENCES sistema(id),
  resumo      text NOT NULL,
  achados     jsonb NOT NULL DEFAULT '[]',  -- [{titulo, severidade, evidencia, correcao}]
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ============ Mensagens automáticas ============
CREATE TABLE modelo_mensagem (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                text NOT NULL,
  canal               text NOT NULL CHECK (canal IN ('whatsapp','email')),
  assunto             text,                 -- e-mail
  corpo               text NOT NULL,        -- com {nome_cliente}, {valor}, {data_vencimento}, {nome_sistema}, {link_pagamento}
  wa_template_nome    text,                 -- nome do template aprovado na Meta
  wa_template_status  text CHECK (wa_template_status IN ('pendente','aprovado','rejeitado')),
  gatilho             text NOT NULL CHECK (gatilho IN ('manual','dias_vencimento','fatura_gerada','pagamento_confirmado',
                                                       'assinatura_expirando','dominio_expirando','ssl_expirando','agendado')),
  gatilho_dias        int,                  -- ex.: -3 = 3 dias antes; 2 = 2 dias depois
  recorrencia_cron    text,                 -- para gatilho 'agendado'
  horario_comercial   boolean NOT NULL DEFAULT true,
  exige_confirmacao   boolean NOT NULL DEFAULT true,
  ativo               boolean NOT NULL DEFAULT true,
  criado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE envio_mensagem (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id       uuid REFERENCES modelo_mensagem(id),
  cliente_id      uuid NOT NULL REFERENCES cliente(id),
  fatura_id       uuid REFERENCES fatura(id),
  tarefa_id       uuid REFERENCES tarefa(id),  -- lote aprovado que originou o envio
  canal           text NOT NULL CHECK (canal IN ('whatsapp','email')),
  destino         text NOT NULL,
  conteudo        text NOT NULL,            -- texto final já com variáveis resolvidas
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviada','entregue','lida','falhou')),
  provedor_id     text UNIQUE,              -- id da mensagem no provedor (webhook de status)
  erro            text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modelo_id, cliente_id, fatura_id) -- mesmo lembrete não sai duas vezes para a mesma fatura
);
CREATE INDEX ON envio_mensagem (cliente_id, criado_em DESC);

-- ============ Notificações para o admin ============
CREATE TABLE notificacao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL,                -- queda, seguranca, tarefa_aguardando, pagamento...
  severidade  text NOT NULL DEFAULT 'info' CHECK (severidade IN ('info','aviso','critico')),
  titulo      text NOT NULL,
  link        text,
  lida_em     timestamptz,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ============ Auditoria (append-only) ============
CREATE TABLE log_auditoria (
  id          bigserial PRIMARY KEY,
  autor_tipo  text NOT NULL CHECK (autor_tipo IN ('admin','agente','executor','sistema','webhook')),
  autor_id    text,
  acao        text NOT NULL,
  entidade    text,
  entidade_id text,
  contexto    jsonb NOT NULL DEFAULT '{}',
  ip          inet,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON log_auditoria (criado_em DESC);

CREATE FUNCTION bloqueia_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'log_auditoria é somente inserção'; END $$;
CREATE TRIGGER log_auditoria_imutavel BEFORE UPDATE OR DELETE ON log_auditoria
  FOR EACH ROW EXECUTE FUNCTION bloqueia_alteracao();

-- ============ Visões financeiras ============
-- MRR: valor_mensal_cent já é mensal; o ciclo só define a frequência da cobrança
CREATE VIEW v_mrr AS
SELECT coalesce(sum(valor_mensal_cent), 0) AS mrr_cent, coalesce(sum(valor_mensal_cent), 0) * 12 AS arr_cent
FROM assinatura WHERE status = 'ativa';

-- Receita realizada por mês e tipo (projeto × recorrente)
CREATE VIEW v_receita_mensal AS
SELECT date_trunc('month', pago_em)::date AS mes, tipo, sum(valor_cent) AS total_cent, count(*) AS faturas
FROM fatura WHERE status = 'paga'
GROUP BY 1, 2;

-- Inadimplência
CREATE VIEW v_inadimplencia AS
SELECT cliente_id, count(*) AS faturas_vencidas, sum(valor_cent) AS valor_cent, min(vencimento) AS mais_antiga
FROM fatura WHERE status IN ('aberta','vencida') AND vencimento < current_date
GROUP BY cliente_id;
