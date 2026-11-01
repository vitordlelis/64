-- Integração com o GitHub: um token por instalação (cifrado) e o repositório de cada sistema.
CREATE TABLE integracao (
  nome          text PRIMARY KEY,             -- 'github'
  segredo       text NOT NULL,                -- token cifrado com APP_KEY; nunca sai da API
  dados         jsonb NOT NULL DEFAULT '{}',  -- ex.: login e nome da conta
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sistema ADD COLUMN github_repo text CHECK (github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
ALTER TABLE sistema ADD COLUMN github_status jsonb;            -- último retrato: commits, CI, PRs, issues, release
ALTER TABLE sistema ADD COLUMN github_atualizado_em timestamptz;
