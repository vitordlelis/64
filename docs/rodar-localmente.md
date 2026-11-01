# Ver o VL Command no seu computador

Roda tudo no seu computador. O sistema começa **vazio**: você cria o seu acesso e cadastra os seus clientes.

## Uma vez só: instalar
1. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ — instale e abra (no Windows, aceite ativar o WSL 2 se ele pedir).
2. **Git**: https://git-scm.com/downloads (no Mac já vem instalado).
3. **App autenticador no celular** (Google Authenticator, Microsoft Authenticator ou Authy).

## Primeira vez: baixar
Abra o PowerShell (Windows) ou Terminal (Mac) e rode:

```bash
git clone https://github.com/vitordlelis/64.git vl-command
```

## Ligar e desligar (Windows)
- **Ligar:** abra a pasta `C:\Users\SEU_USUARIO\vl-command` e dê dois cliques em **`VL Command.bat`**.
  Na primeira vez ele cria o atalho **VL Command** na área de trabalho; depois é só usar o atalho.
  Ele abre o Docker Desktop se precisar, baixa as atualizações, liga o sistema e abre o navegador
  (a primeira vez demora alguns minutos). Deixe a janela preta minimizada.
- **Reiniciar:** botão **↻ Reiniciar sistema** no menu do site. Desliga e religa tudo (aplicando atualizações e mudanças no `.env`);
  a página volta sozinha, ainda logada, em cerca de 30 segundos. Precisa que o sistema tenha sido ligado pelo atalho.
- **Desligar:** botão **⏻ Desligar sistema** no menu do site.

**Primeiro acesso:** a tela pede seu e-mail, uma senha e mostra uma chave para você adicionar no app autenticador;
confirme com o código de 6 dígitos e pronto. Depois disso, entre sempre com e-mail, senha e código.

## Pelo terminal (Mac, ou se preferir)

```bash
cd vl-command
git pull
docker compose -f docker-compose.local.yml up --build     # liga; abra http://localhost:3000
docker compose -f docker-compose.local.yml stop           # desliga (ou Ctrl + C)
```

Para apagar **tudo** (inclusive seus cadastros e seu acesso) e recomeçar do zero:

```bash
docker compose -f docker-compose.local.yml down -v
```

## Ligar os agentes de IA (opcional)
Crie um arquivo `.env` na pasta `vl-command` com a linha abaixo (chave em https://console.anthropic.com) e religue pelo atalho:
```
ANTHROPIC_API_KEY=sua-chave
```
Cada agente tem teto de US$ 1 por dia (ajustável). Sem a chave, os agentes ficam parados.

## Conectar o GitHub (seus sistemas reais)
Em **Configurações → GitHub**, siga o passo a passo para gerar um *fine-grained token* e cole no campo.
Ao conectar, abre a tela **Importar do GitHub**: marque os repositórios, informe o endereço publicado de cada um
(opcional; o VL Command preenche sozinho quando o GitHub sabe) e escolha o cliente (padrão: "VL Systems (meus sistemas)").
O endereço passa a ser monitorado (no ar, tempo de resposta, SSL) e o repositório é verificado a cada 10 minutos
(build/testes do GitHub Actions, commits, PRs, issues e última versão). Se o build quebrar, chega um alerta.

## Conexões de cada sistema
Na página de cada sistema, o quadro **Conexões deste sistema** mostra as ligações e o que falta:
1. **Site no ar** — só o endereço; funciona para qualquer plataforma. Botão "Verificar agora".
2. **Código no GitHub** — Lovable, Bolt, v0, Cursor e Vercel sincronizam com o GitHub; ligue o repositório e pronto.
3. **Cloudflare Pages** — deploys e visitas (ligado sozinho pelo repositório ou endereço).
4. **Google Analytics** — usuários, origens e conversões; tem um pedido pronto para o construtor instalar o GA4 com eventos.
5. **Eventos de segurança** (opcional) — o botão gera um pedido pronto para colar no construtor do site.
   Só funciona com o VL Command na internet (os sites publicados não alcançam o seu computador).

## Cloudflare Pages e Google Analytics (tráfego)
Funcionam com o VL Command no seu computador: ele é quem busca os dados (nada precisa chegar até ele).
- **Cloudflare**: Configurações → Cloudflare Pages → siga os 4 passos (token personalizado com *Conta · Cloudflare Pages · Ler*, *Conta · Account Analytics · Ler* e *Conta · Configurações da conta · Ler*, incluindo a sua conta em Recursos da conta). Para ver visitas, ative **Web Analytics** em cada projeto (Metrics → Enable) e faça um novo deploy. Sites que ainda não estão em Sistemas entram com um clique.
- **Google Analytics**: Configurações → Google Analytics → siga os 5 passos (projeto no Google Cloud, 2 APIs, conta de serviço com chave JSON, e-mail da conta como *Leitor* no GA).
- A tela **Tráfego** junta todos os sites; cada sistema tem o painel com gráfico (deploys marcados), páginas, origens, aparelhos e dicas. Atualiza a cada 30 minutos.

## Escritório 3D e voz
Menu **Escritório 3D**. Para falar com os agentes use **Chrome ou Edge** e permita o microfone quando o navegador pedir.
Diga o nome do agente e o pedido (ex.: "Helena, como foi o dia?"). Sem a chave da API os agentes não respondem, mas a cena mostra os estados.

## Envio de mensagens e bloqueio de IP
Para enviar e-mails, WhatsApp ou bloquear IPs de verdade, coloque as chaves no mesmo arquivo `.env`
(veja os nomes em `.env.example`: `RESEND_API_KEY`, `EMAIL_FROM`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `CLOUDFLARE_API_TOKEN`).
Sem elas, a ação aprovada aparece como **falhou**, com o motivo — nada é enviado sem configuração.
