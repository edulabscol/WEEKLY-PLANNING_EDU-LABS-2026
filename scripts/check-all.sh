#!/usr/bin/env bash
# Batería completa de validación, en orden. Se detiene en el primer fallo. Uso: npm run test:all
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n\033[1;35m▶ %s\033[0m\n' "$1"; }
# Las pruebas usan SQLite. Si hay PostgreSQL disponible (TEST_DATABASE_URL o binarios para el clúster local),
# se repiten las de integración contra PostgreSQL y la cobertura incluye el cliente PostgreSQL.
WITH_PG=""
if [ -n "${TEST_DATABASE_URL:-}" ]; then WITH_PG=1
elif command -v initdb >/dev/null 2>&1 || [ -x /usr/lib/postgresql/16/bin/initdb ]; then
  step "0/9 PostgreSQL de pruebas (clúster local)"; bash scripts/pg-local.sh start && WITH_PG=1
fi
step "1/9 Lint";                 npm run -s lint
step "2/9 Typecheck";            npm run -s typecheck
step "3/9 Pruebas unitarias";    npm run -s test
step "4/9 Pruebas de integración (SQLite)"; npm run -s test:integration
if [ -n "$WITH_PG" ]; then step "5/9 Pruebas de integración (PostgreSQL)"; npm run -s test:integration:pg; else step "5/9 PostgreSQL no disponible: se omiten sus pruebas de integración"; fi
step "6/9 Cobertura"; if [ -n "$WITH_PG" ]; then npm run -s test:coverage:pg; else npm run -s test:coverage; fi
step "7/9 Build de producción";  npm run -s build
step "8/9 Pruebas E2E (Playwright)"; npx playwright test --project=e2e
step "9/9 Pruebas visuales (Playwright)"; npx playwright test --project=visual
printf '\n\033[1;32m✔ Todas las validaciones pasaron.\033[0m\n'
