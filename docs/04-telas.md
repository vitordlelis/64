# 4. Telas e abas

Navegação lateral fixa. Topo: busca global, sino de notificações, contador de **tarefas aguardando aprovação** (sempre visível).

| # | Tela | O que faz | Fase |
|---|---|---|---|
| 1 | **Login** | E-mail + senha + código TOTP. Bloqueio progressivo após tentativas falhas. | 1 |
| 2 | **Visão geral** | Página inicial: MRR, receita do mês × meta, semáforo de todos os sistemas, incidentes abertos, eventos de segurança críticos, tarefas aguardando, resumo do Diretor. | 1 |
| 3 | **Financeiro** | Abas: *Resumo* (MRR, ARR, receita projeto × recorrente, meta, ticket médio, permanência), *Evolução* (gráficos mensal/anual, ano × ano, MRR, churn, crescimento), *Previsão* (12 meses), *Por cliente*. Filtros de período e cliente. | 1 |
| 4 | **Faturas** | Lista com filtros (aberta/paga/vencida), inadimplência total, ações: gerar avulsa, reenviar link, marcar como paga, cancelar. | 1 |
| 5 | **Clientes** | Lista e ficha do cliente: contatos, canais e opt-out, sistemas, assinaturas, faturas, mensagens enviadas, histórico. | 1 |
| 6 | **Sistemas** | Lista e ficha do sistema: status e latência, gráfico de uptime 24h/7d/30d, incidentes, base de conhecimento (domínio, hospedagem, SSL, vencimentos, referência de acessos), chave de ingestão, autorização de pen test + verificação DNS. | 1 |
| 7 | **Saúde (Uptime)** | Painel semáforo agrupado por cliente, atualização em tempo real; histórico de incidentes com duração. | 1 |
| 8 | **Segurança (SOC)** | Timeline de eventos por sistema com severidade, recomendação e evidências; ações: reconhecer, resolver, marcar falso positivo, pedir bloqueio de IP. Botão **Executar pen test** e lista de relatórios. | 2 |
| 9 | **Mensagens** | Abas: *Modelos* (construtor com variáveis clicáveis e pré-visualização), *Automações* (gatilhos, agendamento, recorrência), *Disparo manual*, *Histórico* (status por mensagem). Status dos templates na Meta. | 2 |
| 10 | **Relatórios** ⏳ não implementada | Relatórios mensais por cliente: gerar, visualizar, enviar. | 2 |
| 11 | **Agentes** | Card por agente (nome, função, estado, tarefa atual, custo do dia, pausar/ativar). Histórico de atividade. Campo de comando por texto. | 3 |
| 12 | **Aprovações** | Fila de tarefas aguardando: descrição, análise, ação exata que será executada (ex.: lista de destinatários, diff do PR, IP a bloquear), impacto. Aprovar (TOTP se alto impacto) / rejeitar com motivo. | 3 |
| 13 | **Escritório 3D** | Cena com os agentes nas mesas refletindo estado real, telão com faturamento anual, clique no agente abre painel, botão de voz e campo de texto. | 4 |
| 14 | **Auditoria** | Log global pesquisável por autor, ação, entidade e período. Exportar CSV. | 1 |
| 15 | **Configurações** | Conta e 2FA, metas de receita, integrações (Asaas, WhatsApp, e-mail, Cloudflare, GitHub), horário comercial, limites dos agentes. | 1 |
| 16 | **Portal do cliente** ⏳ não implementado (app separado, mesma API) | Cliente vê status do seu sistema, faturas e relatórios. Login próprio, somente leitura. | 2 |
