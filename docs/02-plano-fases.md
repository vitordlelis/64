# 2. Plano de implementação em fases

Cada fase termina com algo **em produção e usado de verdade**. Uma fase só começa quando a anterior está estável.

## Fase 0 — Fundação técnica (≈1 semana)
- Monorepo TypeScript (`apps/web`, `apps/api`, `apps/workers`, `apps/executor`, `packages/shared`).
- Docker Compose (postgres, redis, api, web, workers, executor), CI com lint + testes + migrações.
- `db/schema.sql` aplicado por migração; backup diário do Postgres testado com restore.

**Pronto quando:** deploy automatizado no VPS a partir da branch principal.

## Fase 1 — MVP de gestão (≈4 semanas)
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
