# Instalación local en Windows (PowerShell). Uso, desde la carpeta del proyecto:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Test-NodeOk {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return $false }
  $v = (& node -p "process.versions.node").Split('.')
  return ([int]$v[0] -gt 22) -or (([int]$v[0] -eq 22) -and ([int]$v[1] -ge 18))
}

if (-not (Test-NodeOk)) {
  Write-Host "Node.js 22.18+ no encontrado. Instalando Node.js LTS con winget..." -ForegroundColor Yellow
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget no está disponible. Instale Node.js LTS desde https://nodejs.org y vuelva a ejecutar este script." -ForegroundColor Red
    exit 1
  }
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Test-NodeOk)) { Write-Host "Cierre y vuelva a abrir PowerShell y ejecute de nuevo este script." -ForegroundColor Yellow; exit 1 }
}

Write-Host "Node.js $(node -v)" -ForegroundColor Green
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run setup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "`nIniciando en modo desarrollo: http://127.0.0.1:3000  (Ctrl+C para detener)" -ForegroundColor Cyan
npm run dev
