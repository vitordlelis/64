# Ver o VL Command no seu computador

Roda tudo no seu computador, com **dados de demonstração** (clientes, contratos e quase 2 anos de faturas fictícias).
Nada vai para a internet e nenhum cliente real é cobrado ou avisado.

## Uma vez só: instalar
1. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ — instale e abra (no Windows, aceite ativar o WSL 2 se ele pedir).
2. **Git**: https://git-scm.com/downloads (no Mac já vem instalado).
3. **App autenticador no celular** (Google Authenticator, Microsoft Authenticator ou Authy).
   Adicione uma conta **digitando a chave**: `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (nome: VL Command demo).

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

| Login | |
|---|---|
| E-mail | `demo@vlcommand.local` |
| Senha | `demo-vl-command` |
| Código | o número de 6 dígitos do app autenticador |

## Pelo terminal (Mac, ou se preferir)

```bash
cd vl-command
git pull
docker compose -f docker-compose.local.yml up --build     # liga; abra http://localhost:3000
docker compose -f docker-compose.local.yml stop           # desliga (ou Ctrl + C)
```

Para apagar os dados de demonstração e recomeçar do zero:

```bash
docker compose -f docker-compose.local.yml down -v
```

## O que esperar
- O sistema "Site de imóveis" aparece **fora do ar de propósito**, para você ver alertas e incidentes.
- Os outros sites de demonstração ficam verdes após ~1 minuto (o monitor checa a cada 60 s).
- Pode cadastrar, editar e marcar faturas como pagas à vontade: é tudo local.
- Asaas fica desligado; e-mail, WhatsApp e bloqueio de IP são **simulados** (nada sai do seu computador).
- Em **Aprovações** já haverá uma cobrança de atraso e, ~1 minuto depois de ligar, um bloqueio de IP proposto pelo SOC
  (um ataque de força bruta simulado). Aprove e veja o resultado em Mensagens → Histórico e em Segurança.
