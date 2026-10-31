# VL Command — Central de Gestão de Sistemas

Plataforma única da VL Systems para administrar todos os sistemas entregues: faturamento, disponibilidade,
segurança defensiva, agentes de IA 24/7 com aprovação humana, escritório 3D e mensagens automáticas.

**Status:** Fases 0, 1 e 2 implementadas — gestão (clientes, contratos, faturas + Asaas, financeiro, uptime), aprovações + Executor,
central de mensagens (e-mail/WhatsApp) e SOC Nível 1. Ver [plano em fases](docs/02-plano-fases.md).

## Só quero ver o sistema

Siga [docs/rodar-localmente.md](docs/rodar-localmente.md): Docker Desktop + um comando, com dados de demonstração.

## Rodar localmente (desenvolvimento)

Requisitos: Node 22.18+, pnpm 10, PostgreSQL 16.

```bash
pnpm install
createdb vlc
export DATABASE_URL=postgres://usuario:senha@localhost:5432/vlc
export APP_KEY=$(openssl rand -base64 32)        # guarde: cifra o segredo do 2FA
pnpm --filter api migrate
pnpm --filter api criar-admin voce@vlsystems.com.br   # pede a senha e mostra o link do 2FA
pnpm dev:api      # API em :3000
pnpm dev:worker   # jobs (uptime, faturas, Asaas, SSL)
pnpm dev:web      # painel em :5173
```

Testes (precisam de um banco com nome terminado em `_test`, que é recriado a cada execução):

```bash
createdb vlc_test
DATABASE_URL=postgres://usuario:senha@localhost:5432/vlc_test pnpm test
pnpm typecheck
```

## Produção

```bash
cp .env.example .env          # preencha DOMINIO, POSTGRES_PASSWORD, APP_KEY e integrações
docker compose up -d --build  # app + worker + postgres + caddy (HTTPS) + backup diário
docker compose exec app node apps/api/src/cli/criar-admin.ts voce@vlsystems.com.br
```

- Backups: `./backups/vlc-AAAA-MM-DD.dump` (14 dias). Restaurar: `pg_restore -d vlc --clean vlc-AAAA-MM-DD.dump`.
- Sonda externa (rode em outro provedor/região): `API_URL=https://SEU_DOMINIO SONDA_TOKEN=... node apps/api/src/sonda.ts`.
- Webhook do Asaas: `https://SEU_DOMINIO/api/webhooks/asaas` com o token de `ASAAS_WEBHOOK_TOKEN`.

## Estrutura

```
apps/api/src/      server.ts, app.ts (rotas), worker.ts (jobs), sonda.ts, migrate.ts, cli/criar-admin.ts
apps/api/test/     testes unitários e de integração (node:test)
apps/web/src/      painel React (páginas em paginas/)
db/migrations/     schema SQL versionado
docs/              escopo técnico
```

## Entregáveis de design (seção 13 do escopo)

| # | Entregável | Arquivo |
|---|-----------|---------|
| 1 | Arquitetura geral + diagrama | [docs/01-arquitetura.md](docs/01-arquitetura.md) |
| 2 | Plano de implementação em fases (MVP → completo) | [docs/02-plano-fases.md](docs/02-plano-fases.md) |
| 3 | Modelo de dados completo | [docs/03-modelo-dados.md](docs/03-modelo-dados.md) + [db/migrations/](db/migrations/) |
| 4 | Lista de telas/abas | [docs/04-telas.md](docs/04-telas.md) |
| 5 | Especificação dos agentes | [docs/05-agentes.md](docs/05-agentes.md) |
| 6 | Stack e justificativa | [docs/01-arquitetura.md#stack-e-justificativa](docs/01-arquitetura.md#stack-e-justificativa) |

## Decisões em aberto (precisam do administrador)

1. **Provedor de cobrança**: implementado com Asaas (Pix, boleto, cartão, webhooks). Trocar exige reescrever `apps/api/src/asaas.ts` e o webhook.
2. **Provedor WhatsApp**: proposto WhatsApp Cloud API direto da Meta (Fase 2). Exige número dedicado e conta Business verificada — vale iniciar o cadastro já.
3. **WAF para bloqueio de IP**: proposto Cloudflare (Fase 2).
4. **Hospedagem da VL Command**: VPS separado da infraestrutura dos clientes + sonda externa em outro provedor.
