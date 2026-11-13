#!/usr/bin/env bash
# Inicia la aplicación en segundo plano (desarrollo local). Uso: npm run app:start
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .run

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  echo "Se requiere Node.js 22.18 o superior (actual: $(node -v))." >&2
  exit 1
fi

if [ -f .run/server.pid ] && kill -0 "$(cat .run/server.pid)" 2>/dev/null; then
  echo "La aplicación ya está en ejecución (PID $(cat .run/server.pid))."
  exit 0
fi

[ -f .env ] || { cp .env.example .env; echo "Se creó .env a partir de .env.example"; }
[ -d node_modules ] || { if [ -f package-lock.json ]; then npm ci; else npm install; fi; }
[ -f dist/server.js ] || npm run build

set -a; . ./.env; set +a
# Desarrollo con el clúster local: se inicia si DATABASE_URL apunta a él.
if [[ "${DATABASE_URL:-}" == *"127.0.0.1:54329"* ]]; then bash scripts/pg-local.sh start >/dev/null; fi
node --disable-warning=ExperimentalWarning scripts/ensure-database.ts 2>/dev/null || true
if [ "${DB_AUTO_MIGRATE:-true}" = "true" ]; then node --disable-warning=ExperimentalWarning dist/cli/migrate.js; fi
nohup node --disable-warning=ExperimentalWarning dist/server.js >> .run/server.log 2>&1 &
echo $! > .run/server.pid

URL="http://${HOST:-127.0.0.1}:${PORT:-3000}"
for _ in $(seq 1 30); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
    echo "✔ Aplicación disponible en $URL  (logs: .run/server.log)"
    exit 0
  fi
  sleep 0.5
done
echo "✖ La aplicación no respondió. Revise .run/server.log" >&2
exit 1
