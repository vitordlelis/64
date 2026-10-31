# Ver o VL Command no seu computador

Roda tudo no seu computador, com **dados de demonstração** (clientes, contratos e quase 2 anos de faturas fictícias).
Nada vai para a internet e nenhum cliente real é cobrado ou avisado.

## Uma vez só: instalar
1. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ — instale e abra (no Windows, aceite ativar o WSL 2 se ele pedir).
2. **Git**: https://git-scm.com/downloads (no Mac já vem instalado).
3. **App autenticador no celular** (Google Authenticator, Microsoft Authenticator ou Authy).
   Adicione uma conta **digitando a chave**: `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (nome: VL Command demo).

## Primeira vez: baixar e subir
Abra o Terminal (Mac) ou PowerShell (Windows) e rode:

```bash
git clone https://github.com/vitordlelis/64.git vl-command
cd vl-command
docker compose -f docker-compose.local.yml up --build
```

A primeira vez demora alguns minutos. Quando aparecer `Server listening at`, abra **http://localhost:3000**:

| Campo | Valor |
|---|---|
| E-mail | `demo@vlcommand.local` |
| Senha | `demo-vl-command` |
| Código | o número de 6 dígitos do app autenticador |

Para parar: `Ctrl + C` no terminal.

## Ver as atualizações (a cada nova fase)
Dentro da pasta `vl-command`:

```bash
git pull
docker compose -f docker-compose.local.yml up --build
```

Se uma atualização mudar a estrutura dos dados de demonstração, comece do zero (apaga só o banco local):

```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up --build
```

## O que esperar
- O sistema "Site de imóveis" aparece **fora do ar de propósito**, para você ver alertas e incidentes.
- Os outros sites de demonstração ficam verdes após ~1 minuto (o monitor checa a cada 60 s).
- Pode cadastrar, editar e marcar faturas como pagas à vontade: é tudo local.
- Asaas, e-mail e WhatsApp ficam desligados neste modo.
