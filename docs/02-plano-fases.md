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

## Fase 2 — Segurança e mensagens ✅ implementada (exceto os itens marcados ⏳)
- **Ingestão de eventos de segurança**: ⏳ o pacote pronto (npm/PHP/Python) não foi feito; hoje há um exemplo de código na página de cada sistema que envia login falho, 4xx/5xx e volume de requisições com a chave de ingestão do sistema. Alternativa sem código: logs da Cloudflare.
- **SOC N1 (regras determinísticas)**: força bruta, pico de requisições, varredura, anomalia de erros → `evento_seguranca` com severidade, recomendação e timeline; crítico alerta na hora.
- **Executor** (primeira versão) com ações: `enviar_mensagens`, `bloquear_ip` — sempre via tarefa aprovada.
- **Central de mensagens**: construtor com variáveis, modelos prontos, gatilhos por data/evento, agendamento, WhatsApp Cloud API + e-mail, confirmação de disparo em massa, histórico de status por webhook, opt-out e horário comercial.
- ⏳ **Relatórios mensais** por cliente (PDF) e **portal do cliente** (somente leitura: status do sistema e faturas, com RLS) — **ainda não implementados**.

**Pronto quando:** lembretes de vencimento saem automaticamente após aprovação e uma tentativa de força bruta simulada num sistema próprio gera alerta e proposta de bloqueio.

## Fase 3 — Agentes de IA ✅ implementada
- Infra de agentes: worker por papel, ferramentas de leitura, criação de tarefa, teto de custo diário, painel de aprovação.
- Ordem de entrada: **SOC N1** (tria eventos já existentes) → **Diretor** (resumo diário) → **Engenheiro** (propostas de correção via PR) → **Marketing** → **Designer**.
- **Pen tester sob demanda** com verificação de domínio por DNS TXT e relatório.
- Fluxo completo: proposta → confirmação (step-up para alto impacto) → execução → registro.

**Pronto quando:** cada agente gerou ao menos uma proposta útil aprovada e executada, e nenhuma ação rodou sem aprovação (verificado no log).

## Fase 4 — Escritório 3D e voz ✅ implementada
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

## Notas da implementação da Fase 2
- **Aprovações** (`/aprovacoes`): toda ação com efeito vira uma *tarefa*. O **Executor** (`apps/api/src/executor.ts`, serviço próprio no Docker) só executa tarefas aprovadas, de um catálogo fechado (`apps/api/src/acoes.ts`): `enviar_mensagens`, `bloquear_ip`, `desbloquear_ip`. Alto impacto (bloqueio) pede o código do autenticador. Tarefas não decididas expiram em 72 h.
- **Mensagens** (`/mensagens`): 5 modelos prontos (lembrete, atraso, pagamento, renovação, domínio), editáveis, com variáveis e prévia. Gatilhos por data/evento a cada 15 min, agendamento com repetição semanal/mensal, opt-out por canal (resposta "SAIR" no WhatsApp) e horário comercial. Cada lote vira uma tarefa com a lista de destinatários e o texto final; o admin pode desligar a confirmação por modelo.
- **WhatsApp** usa template aprovado na Meta (parâmetros na ordem das variáveis do texto); status entregue/lida chegam pelo webhook. **E-mail** (Resend) registra só "enviada".
- **SOC N1** (`/seguranca`): cada sistema recebe uma chave de ingestão e envia `login_falho`, `http_4xx`, `http_5xx`, `req`. Regras a cada minuto (janela de 5 min): força bruta (≥10), varredura (≥20 caminhos 404), pico por IP (≥300 req), anomalia de 5xx (≥20). Evento + alerta + proposta de bloqueio de 24 h no Cloudflare.
- **Modo demonstração** (`MODO_DEMONSTRACAO=1`, desligado por padrão): mensagens e bloqueios são simulados, útil só para testes.
- Não implementado: regra de pico global comparando com a média histórica (só pico por IP).

## Notas da implementação da Fase 3
- Agentes em `apps/api/src/agentes/`: loop manual de ferramentas com o SDK oficial da Anthropic; cada papel recebe só as suas ferramentas, e ferramentas fora do papel são recusadas mesmo se pedidas. Ferramentas de escrita só criam **propostas** (tarefas aguardando) ou registros internos.
- Modelo padrão de todos: `claude-opus-5-5`, trocável por agente na tela **Agentes** (Sonnet 5.5 / Haiku 5.5). Fallback no servidor quando o modelo recusa. Custo por execução em US$ registrado em `atividade_agente`, com teto diário por agente (padrão US$ 1).
- Agenda: Helena diário (horário comercial), Rafael diário, Marcos semanal, Lara mensal, Vigia a cada alerta médio+, Sentinela só sob demanda. Pedidos por texto entram na fila e são respondidos em segundos.
- **Pen test**: autorização + domínio verificado por DNS TXT + código do autenticador. As checagens (HTTPS, cabeçalhos, cookies, arquivos expostos) rodam no Executor, só com GET; a Sentinela escreve a análise.
- Diferença em relação ao escopo: Engenheiro e Designer registram **recomendações detalhadas** em vez de abrir PRs, pois os repositórios dos clientes ainda não estão integrados. Abrir PR no GitHub é o próximo passo natural (nova ação no catálogo do Executor).

## Notas da implementação da Fase 4
- `/escritorio` (React Three Fiber, carregado só nesta tela): uma mesa por agente; o personagem digita e o monitor acende em azul quando **trabalhando**, um "!" amarelo flutua quando há proposta **aguardando aprovação**, e ele fica encostado quando **ocioso** (cinza se pausado). Estado lido do banco a cada 3 s.
- Telão com o faturamento do ano. Clique no agente abre o painel com o que está fazendo e o pedido por texto.
- **Voz** (Chrome/Edge, Web Speech API em pt-BR): diga o nome do agente e o pedido; a resposta é falada. "Confirmo" aprova a única proposta pendente do agente selecionado, sempre com um clique de confirmação; ações de alto impacto continuam exigindo o código do autenticador na tela Aprovações.
- Lista em texto dos agentes ao lado da cena, para leitores de tela.

## Pendências conhecidas (conferência de 01/11/2026)
- ⏳ Portal do cliente e relatórios mensais por cliente (escopo, seção 9).
- ⏳ Webhook para os sistemas avisarem eventos de saúde (escopo, Módulo 2); hoje a saúde vem só do monitor e da sonda externa.
- ⏳ Faturamento detalhado **por projeto/sistema** (escopo, Módulo 1); hoje há por cliente.
- ⏳ Alertas ao administrador por WhatsApp/push (escopo, seção 9); hoje por e-mail e no painel.
- ⏳ Engenheiro e Designer abrirem PRs no GitHub; hoje registram recomendações.
