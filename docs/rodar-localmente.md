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

## Escritório 3D e voz
Menu **Escritório 3D**. Para falar com os agentes use **Chrome ou Edge** e permita o microfone quando o navegador pedir.
Diga o nome do agente e o pedido (ex.: "Helena, como foi o dia?"). Sem a chave da API os agentes não respondem, mas a cena mostra os estados.

## Envio de mensagens e bloqueio de IP
Para enviar e-mails, WhatsApp ou bloquear IPs de verdade, coloque as chaves no mesmo arquivo `.env`
(veja os nomes em `.env.example`: `RESEND_API_KEY`, `EMAIL_FROM`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `CLOUDFLARE_API_TOKEN`).
Sem elas, a ação aprovada aparece como **falhou**, com o motivo — nada é enviado sem configuração.
