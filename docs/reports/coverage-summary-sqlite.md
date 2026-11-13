# Resumen de cobertura

| Grupo | Archivos | Líneas | Funciones | Ramas |
|---|---:|---:|---:|---:|
| Global (servidor + compartido) | 31 |  98.3 % |  97.5 % |  90.8 % |
| Lógica de negocio (rules, weeks, validation, services) | 9 |  99.2 % |  98.9 % |  93.5 % |
| Repositorios y base de datos | 13 |  99.0 % |  96.1 % |  91.7 % |
| Cliente PostgreSQL nativo | 0 | 100.0 % | 100.0 % | 100.0 % |
| Capa HTTP | 7 |  95.0 % |  97.3 % |  82.4 % |

| Archivo | Líneas | Funciones | Ramas |
|---|---:|---:|---:|
| src/server/app.ts |  94.6 % | 100.0 % |  81.9 % |
| src/server/config.ts | 100.0 % | 100.0 % |  96.3 % |
| src/server/db/connect.ts | 100.0 % | 100.0 % | 100.0 % |
| src/server/db/database.ts |  94.4 % |  87.5 % |  88.5 % |
| src/server/db/describe.ts | 100.0 % | 100.0 % | 100.0 % |
| src/server/db/errors.ts |  75.0 % |  66.7 % |  75.0 % |
| src/server/db/migrations.ts | 100.0 % | 100.0 % |  66.7 % |
| src/server/db/seed.ts | 100.0 % | 100.0 % |  87.9 % |
| src/server/db/sql.ts | 100.0 % | 100.0 % |  90.5 % |
| src/server/db/sqlite.ts | 100.0 % |  96.2 % |  98.4 % |
| src/server/http/errors.ts | 100.0 % | 100.0 % | 100.0 % |
| src/server/http/rate-limit.ts | 100.0 % |  85.7 % | 100.0 % |
| src/server/http/router.ts | 100.0 % | 100.0 % |  94.1 % |
| src/server/http/static.ts |  79.3 % | 100.0 % |  79.2 % |
| src/server/http/util.ts |  93.5 % | 100.0 % |  78.3 % |
| src/server/logger.ts | 100.0 % |  87.5 % | 100.0 % |
| src/server/repositories/misc.ts | 100.0 % | 100.0 % |  89.3 % |
| src/server/repositories/sessions.ts | 100.0 % | 100.0 % |  91.7 % |
| src/server/repositories/tasks.ts |  99.0 % |  94.4 % |  94.6 % |
| src/server/repositories/timers.ts | 100.0 % | 100.0 % | 100.0 % |
| src/server/repositories/users.ts | 100.0 % | 100.0 % |  80.0 % |
| src/server/routes/api.ts |  99.1 % |  96.6 % |  78.9 % |
| src/server/services/admin.ts | 100.0 % | 100.0 % |  78.7 % |
| src/server/services/auth.ts |  97.2 % | 100.0 % |  94.4 % |
| src/server/services/context.ts | 100.0 % |  85.7 % | 100.0 % |
| src/server/services/passwords.ts | 100.0 % | 100.0 % |  90.9 % |
| src/server/services/planner.ts |  98.5 % |  97.4 % |  92.3 % |
| src/shared/constants.ts | 100.0 % | 100.0 % | 100.0 % |
| src/shared/rules.ts | 100.0 % | 100.0 % |  97.1 % |
| src/shared/validation.ts |  99.1 % | 100.0 % |  98.4 % |
| src/shared/weeks.ts | 100.0 % | 100.0 % |  89.6 % |

Motor de pruebas: SQLite · Generado: 2026-11-13T15:16:46.489Z · Fuente: coverage/lcov.info (V8, node --experimental-test-coverage)
