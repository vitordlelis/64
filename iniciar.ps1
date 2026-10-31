# Liga o VL Command (modo local) e abre o navegador. Usado pelo atalho "VL Command".
# Quando o botão "Desligar sistema" do site é clicado, esta janela percebe e desliga o resto.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'VL Command'
$compose = @('compose', '-f', 'docker-compose.local.yml')

# Cria o atalho na área de trabalho na primeira vez.
$atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'VL Command.lnk'
if (-not (Test-Path $atalho)) {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
    $s.TargetPath = Join-Path $PSScriptRoot 'VL Command.bat'
    $s.WorkingDirectory = $PSScriptRoot
    $s.WindowStyle = 7  # minimizado
    $s.Save()
    Write-Host 'Atalho "VL Command" criado na área de trabalho.'
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

Write-Host 'Buscando atualizações...'
git pull --ff-only
if ($LASTEXITCODE -ne 0) { Write-Host 'Sem atualizações (ou sem internet). Seguindo com a versão atual.' }

Write-Host 'Ligando o VL Command (na primeira vez demora alguns minutos)...'
docker @compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao ligar. Copie as mensagens acima e envie ao suporte.'; Read-Host 'Enter para fechar'; exit 1 }

function SiteNoAr { try { (Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
while (-not (SiteNoAr)) { Start-Sleep 2 }
Start-Process 'http://localhost:3000'
Write-Host ''
Write-Host 'VL Command LIGADO em http://localhost:3000'
Write-Host 'Pode minimizar esta janela. Para desligar, use o botão "Desligar sistema" no site.'

# Espera o botão "Desligar sistema" (a app encerra sozinha) e desliga o banco e o worker.
while (docker @compose ps -q --status running app) { Start-Sleep 5 }
Write-Host 'Desligando...'
docker @compose stop
Write-Host 'VL Command DESLIGADO.'
Start-Sleep 3
