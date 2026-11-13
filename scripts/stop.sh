#!/usr/bin/env bash
# Detiene la aplicación iniciada con scripts/start.sh. Uso: npm run app:stop
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .run/server.pid ]; then
  echo "No hay una instancia registrada (.run/server.pid)."
  exit 0
fi
PID=$(cat .run/server.pid)
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID"
  for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$PID" 2>/dev/null && kill -KILL "$PID"
  echo "✔ Aplicación detenida (PID $PID)."
else
  echo "El proceso $PID ya no estaba en ejecución."
fi
rm -f .run/server.pid
