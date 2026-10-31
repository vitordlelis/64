-- Fase 3: agentes de IA e pen test sob demanda.

-- Modelo padrão de todos: claude-opus-5-5 (o admin pode trocar por agente na tela Agentes).
UPDATE agente SET modelo = 'claude-opus-5-5';
ALTER TABLE agente ADD COLUMN ultimo_ciclo_em timestamptz;
UPDATE agente SET teto_custo_dia_cent = 100;  -- US$ 1,00 por dia por agente (centavos de dólar)

-- Tudo o que cada agente faz: cada execução, com tokens e custo (US$).
CREATE TABLE atividade_agente (
  id             bigserial PRIMARY KEY,
  agente_id      uuid NOT NULL REFERENCES agente(id),
  tarefa_id      uuid REFERENCES tarefa(id),
  tipo           text NOT NULL CHECK (tipo IN ('ciclo','comando','triagem','relatorio')),
  resumo         text NOT NULL,
  tokens_entrada int NOT NULL DEFAULT 0,
  tokens_saida   int NOT NULL DEFAULT 0,
  custo_usd      numeric(12,6) NOT NULL DEFAULT 0,
  erro           text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON atividade_agente (agente_id, criado_em DESC);

ALTER TABLE evento_seguranca ADD COLUMN triado_em timestamptz;
ALTER TABLE sistema ADD COLUMN token_verificacao text;  -- registro DNS TXT que prova que o domínio é nosso
