# Liga o VL Command (modo local) e abre o navegador. Usado pelo atalho "VL Command".
# Quando o botão "Desligar sistema" do site é clicado, esta janela percebe e desliga o resto.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'VL Command'
$compose = @('compose', '-f', 'docker-compose.local.yml')

# Cria o atalho na área de trabalho e no menu Iniciar (busque "VL Command" na tecla Windows).
foreach ($pasta in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $atalho = Join-Path $pasta 'VL Command.lnk'
    if (Test-Path $atalho) { continue }
    try {
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
        $s.TargetPath = Join-Path $PSScriptRoot 'VL Command.bat'
        $s.WorkingDirectory = $PSScriptRoot
        $s.WindowStyle = 7  # minimizado
        $s.Save()
    } catch { Write-Host "Não consegui criar o atalho em $pasta : $_" }
    if (Test-Path $atalho) { Write-Host "Atalho criado em: $atalho" }
}

function DockerPronto { docker info *> $null; return $LASTEXITCODE -eq 0 }
if (-not (DockerPronto)) {
    Write-Host 'Abrindo o Docker Desktop (pode levar 1 a 2 minutos)...'
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    $limite = (Get-Date).AddMinutes(4)
    while (-not (DockerPronto)) {
        if ((Get-Date) -gt $limite) { Write-Host 'O Docker Desktop não respondeu. Abra-o manualmente e tente de novo.'; Read-Host 'Enter para fechar'; exit 1 }
        Start-Sleep 3
    }
}

# Qual botão foi clicado no site nos últimos 2 minutos ("desligar" ou "reiniciar"), lido da auditoria no banco.
function PedidoDoSite {
    $sql = "select split_part(acao, '/', 4) from log_auditoria where acao in ('POST /api/sistema/desligar', 'POST /api/sistema/reiniciar') and criado_em > now() - interval '2 minutes' order by id desc limit 1"
    "$(docker @compose exec -T postgres psql -U vlc -d vlc -tAc $sql 2>$null)".Trim()
}
function SiteNoAr { try { (Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
$primeiraVez = $true

do {
    Write-Host 'Buscando atualizações...'
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Host 'Sem atualizações (ou sem internet). Seguindo com a versão atual.' }

    Write-Host 'Ligando o VL Command (na primeira vez demora alguns minutos)...'
    docker @compose up -d --build
    if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao ligar. Copie as mensagens acima e envie ao suporte.'; Read-Host 'Enter para fechar'; exit 1 }
    # Cada atualização gera uma imagem nova; apaga as versões antigas sem uso e o cache de build com mais de 7 dias
    # (não toca no banco de dados, que fica num volume separado).
    docker image prune -f *> $null
    docker builder prune -f --filter 'until=168h' *> $null

    while (-not (SiteNoAr)) { Start-Sleep 2 }
    if ($primeiraVez) { Start-Process 'http://localhost:3000'; $primeiraVez = $false }  # ao reiniciar, a aba aberta recarrega sozinha
    Write-Host ''
    Write-Host 'VL Command LIGADO em http://localhost:3000'
    Write-Host 'Pode minimizar esta janela. Use os botões "Reiniciar" ou "Desligar" no site.'

    # Espera a app encerrar (botão no site) e então desliga o banco, o worker e o executor.
    while ($true) {
        while (docker @compose ps -q --status running app) { Start-Sleep 3 }
        $pedido = PedidoDoSite
        if ($pedido) { break }
        Start-Sleep 10  # sem pedido: pode ser erro passageiro que o Docker religa sozinho
        if (-not (docker @compose ps -q --status running app)) { break }
    }
    Write-Host 'Parando os serviços...'
    docker @compose stop
    if ($pedido -eq 'reiniciar') { Write-Host 'Reiniciando...' }
} while ($pedido -eq 'reiniciar')

Write-Host 'VL Command DESLIGADO.'
Start-Sleep 3
