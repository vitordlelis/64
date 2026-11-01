-- Cloudflare Pages (deploys e Web Analytics) e Google Analytics 4 por sistema.
-- As credenciais ficam na tabela integracao ('cloudflare' e 'google'), cifradas.
ALTER TABLE sistema ADD COLUMN cf_projeto text CHECK (cf_projeto ~ '^[a-z0-9-]{1,63}$');  -- nome do projeto no Cloudflare Pages
ALTER TABLE sistema ADD COLUMN ga_propriedade text CHECK (ga_propriedade ~ '^[0-9]{3,20}$'); -- ID numérico da propriedade GA4
ALTER TABLE sistema ADD COLUMN trafego jsonb;                     -- último retrato: deploys, visitas, páginas, origens, dicas
ALTER TABLE sistema ADD COLUMN trafego_atualizado_em timestamptz;
