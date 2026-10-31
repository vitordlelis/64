# 2. Plano de implementação em fases

Cada fase termina com algo **em produção e usado de verdade**. Uma fase só começa quando a anterior está estável.

## Fase 0 — Fundação técnica ✅ implementada
- Monorepo TypeScript: `apps/api` (API, worker, sonda, CLI) e `apps/web`. Executor e agentes entram como novos entrypoints em `apps/api` nas fases 2/3.
- Docker Compose (postgres, app, worker, caddy, backup); CI com typecheck, testes de integração contra Postgres, autoteste do schema, build do front e da imagem.
- Migrações SQL em `db/migrations/`; backup diário com `pg_dump` (14 dias) — restore testado.

**Pronto quando:** deploy automatizado no VPS a partir da branch principal.

## Fase 1 — MVP de gestão ✅ implementada
- Login do admin com senha + TOTP; sessão segura; `log_auditoria` em toda escrita.
- Cadastro de **clientes, sistemas e assinaturas** (inclui base de conhecimento: domínio, hospedagem, vencimentos, referência de acessos).
- **Faturas**: geração mensal automática a partir das assinaturas; integração Asaas (cobrança + webhook de pagamento).
- **Dashboard financeiro**: MRR, ARR, receita projeto × recorrente, receita × meta, ticket médio, tempo de permanência, churn, inadimplência, previsão de 12 meses.
- **Uptime**: health check a cada 60 s, sonda externa, semáforo por cliente, incidentes, alerta por e-mail; aviso de SSL/domínio vencendo.
- Central de notificações (in-app + e-mail).

**Pronto quando:** todos os sistemas reais estão cadastrados, faturas do mês saem sozinhas e uma queda real gera alerta em < 3 min.

## Fase 2 — Segurança e mensagens (≈4 semanas)
- **Ingestão de eventos de segurança**: pacote leve (npm/PHP/Python conforme a stack dos sistemas) que envia login falho, 4xx/5xx e volume de requisições com a chave de ingestão do sistema. Alternativa sem código: logs da Cloudflare.
- **SOC N1 (regras determinísticas)**: força bruta, pico de requisições, varredura, anomalia de erros → `evento_seguranca` com severidade, recomendação e timeline; crítico alerta na hora.
- **Executor** (primeira versão) com ações: `enviar_mensagens`, `bloquear_ip` — sempre via tarefa aprovada.
- **Central de mensagens**: construtor com variáveis, modelos prontos, gatilhos por data/evento, agendamento, WhatsApp Cloud API + e-mail, confirmação de disparo em massa, histórico de status por webhook, opt-out e horário comercial.
- **Relatórios mensais** por cliente (PDF) e **portal do cliente** (somente leitura: status do sistema e faturas, com RLS).

**Pronto quando:** lembretes de vencimento saem automaticamente após aprovação e uma tentativa de força bruta simulada num sistema próprio gera alerta e proposta de bloqueio.

## Fase 3 — Agentes de IA (≈5 semanas)
- Infra de agentes: worker por papel, ferramentas de leitura, criação de tarefa, teto de custo diário, painel de aprovação.
- Ordem de entrada: **SOC N1** (tria eventos já existentes) → **Diretor** (resumo diário) → **Engenheiro** (propostas de correção via PR) → **Marketing** → **Designer**.
- **Pen tester sob demanda** com verificação de domínio por DNS TXT e relatório.
- Fluxo completo: proposta → confirmação (step-up para alto impacto) → execução → registro.

**Pronto quando:** cada agente gerou ao menos uma proposta útil aprovada e executada, e nenhuma ação rodou sem aprovação (verificado no log).

## Fase 4 — Escritório 3D e voz (≈3 semanas)
- Cena R3F: escritório low-poly, uma mesa por agente, personagem com animações de estado (trabalhando / aguardando / ocioso) ligadas ao `agente.estado` por SSE.
- Telão com faturamento anual (dados de `v_receita_mensal`).
- Clique no agente abre painel com tarefa atual e histórico.
- **Comando de voz**: botão "segurar para falar" → transcrição pt-BR → identifica o agente pelo nome → cria tarefa `admin_voz` → agente responde com proposta → admin confirma por voz ("confirmo") **e** clique. Campo de texto equivalente.

**Pronto quando:** o estado mostrado no 3D bate com o banco em tempo real e um comando de voz gera uma proposta confirmável.

## Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Aprovação de template WhatsApp demora | Iniciar o cadastro na Meta já na Fase 1; e-mail como fallback. |
| Custo de IA "24/7" | Agentes rodam por evento e em ciclos agendados, não em loop contínuo; teto diário por agente; modelo menor para triagem. |
| Falso positivo do SOC bloquear cliente legítimo | Bloqueio só com aprovação; bloqueio com expiração (24 h padrão). |
| Sistemas dos clientes sem endpoint de health | Fallback para GET na URL principal + verificação de conteúdo. |

## Notas da implementação da Fase 1
- **Faturas recorrentes** são geradas pelo worker a cada hora para a competência atual (idempotente). Não há geração retroativa de meses passados.
- **Fatura de projeto**: botão "faturar projeto" na assinatura (vencimento em 7 dias) ou fatura avulsa na tela Faturas.
- **Asaas** é opcional: sem `ASAAS_API_KEY` as faturas existem só no painel. Com a chave, o worker cria cliente e cobrança (Pix/boleto/cartão) a cada 5 min; o webhook baixa a fatura paga. Cancelar ou marcar paga no painel reflete no Asaas.
- **Uptime**: check a cada 60 s; amarelo = lento ou 1–2 falhas; vermelho/incidente = 3 falhas seguidas não desmentidas pela sonda externa. SSL lido do certificado a cada 6 h (alerta < 15 dias); domínio pela data cadastrada (alerta < 30 dias).
- **Sonda externa**: `apps/api/src/sonda.ts`, rodando em outro provedor com `API_URL` e `SONDA_TOKEN`.
- **Alertas** vão para Notificações e, com Resend configurado, por e-mail (aviso e crítico).
