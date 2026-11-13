#!/usr/bin/env bash
# Instalación local en macOS o Linux. Uso, desde la carpeta del proyecto:  bash instalar.sh
set -euo pipefail
cd "$(dirname "$0")"
node_ok() { command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)'; }
if ! node_ok; then
  echo "Se requiere Node.js 22.18 o superior."
  if command -v brew >/dev/null 2>&1; then
    echo "Instalando con Homebrew..."; brew install node
  else
    echo "Instálelo desde https://nodejs.org (LTS) o con nvm (https://github.com/nvm-sh/nvm): nvm install --lts"; exit 1
  fi
fi
echo "Node.js $(node -v)"
npm install
npm run setup
echo; echo "Iniciando en modo desarrollo: http://127.0.0.1:3000  (Ctrl+C para detener)"
npm run dev
