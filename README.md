# VL Command — Central de Gestão de Sistemas

Plataforma única da VL Systems para administrar todos os sistemas entregues: faturamento, disponibilidade,
segurança defensiva, agentes de IA 24/7 com aprovação humana, escritório 3D e mensagens automáticas.

## Entregáveis de design (seção 13 do escopo)

| # | Entregável | Arquivo |
|---|-----------|---------|
| 1 | Arquitetura geral + diagrama | [docs/01-arquitetura.md](docs/01-arquitetura.md) |
| 2 | Plano de implementação em fases (MVP → completo) | [docs/02-plano-fases.md](docs/02-plano-fases.md) |
| 3 | Modelo de dados completo | [docs/03-modelo-dados.md](docs/03-modelo-dados.md) + [db/schema.sql](db/schema.sql) |
| 4 | Lista de telas/abas | [docs/04-telas.md](docs/04-telas.md) |
| 5 | Especificação dos agentes | [docs/05-agentes.md](docs/05-agentes.md) |
| 6 | Stack e justificativa | [docs/01-arquitetura.md#stack-e-justificativa](docs/01-arquitetura.md#stack-e-justificativa) |

## Decisões em aberto (precisam do administrador)

1. **Provedor de cobrança**: proposto Asaas (Pix, boleto, cartão, webhooks). Alternativa: Stripe / Mercado Pago.
2. **Provedor WhatsApp**: proposto WhatsApp Cloud API direto da Meta (sem BSP intermediário). Exige número dedicado e conta Business verificada.
3. **WAF para bloqueio de IP**: proposto Cloudflare (os sistemas dos clientes precisam estar atrás dele para o SOC conseguir bloquear).
4. **Hospedagem da VL Command**: proposto VPS/contêineres separados da infraestrutura dos clientes, com uma sonda de uptime externa adicional.
