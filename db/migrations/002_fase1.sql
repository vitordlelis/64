-- Fase 1: sessões do admin e vínculo com o Asaas.
CREATE TABLE sessao (
  token_hash text PRIMARY KEY,               -- sha256 do token do cookie; o token em si nunca é salvo
  admin_id   uuid NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
  expira_em  timestamptz NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cliente ADD COLUMN asaas_customer_id text UNIQUE;
