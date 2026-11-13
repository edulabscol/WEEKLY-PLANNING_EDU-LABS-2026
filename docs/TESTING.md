# Estrategia y ejecución de pruebas

## Pirámide

| Nivel | Herramienta | Ubicación | Qué verifica | Casos |
|---|---|---|---|---:|
| Unitarias | `node:test` | `tests/unit/` | Reglas de negocio, semanas ISO, formatos, validación, contraseñas, limitador, logs, configuración, router, cookies, errores, cliente PostgreSQL (protocolo, SCRAM con vector RFC 7677, tipos, URL), esquema publicado | 59 |
| Integración | `node:test` + servidor HTTP real + base aislada por suite (**SQLite** y **PostgreSQL 16 real**) | `tests/integration/` | Endpoints, autenticación, CSRF/origen, roles, CRUD, transacciones y savepoints, arrastre de semanas, cronómetro, auditoría, cabeceras, archivos estáticos, CORS, SQLi, límites, persistencia tras reinicio, restricciones CHECK/FK/UNIQUE, modo sin auto-migración, adaptador SQLite (parámetros, errores, transacciones concurrentes, respaldo), selección de motor · solo PostgreSQL: cliente (SSL disable/prefer/require/verify-full, credenciales, pool, conexión cortada, statement_timeout) | 50 SQLite · 59 PostgreSQL |
| E2E | Playwright + Chromium | `tests/e2e/*.spec.ts` | Flujos de usuario reales en el navegador (ver tabla) | 30 |
| Visuales | Playwright `toHaveScreenshot` + verificaciones de layout | `tests/e2e/visual.spec.ts` | 8 pantallas × 4 resoluciones contra capturas de referencia; desbordes, elementos fuera de contenedor, superposiciones | 8 (32 capturas) |

**Motores:** por defecto todas las pruebas usan **SQLite** (no requieren instalar nada). `npm run test:integration:pg` repite las de integración contra **PostgreSQL 16** y añade las del cliente PostgreSQL; `E2E_DB=postgres` hace lo mismo con las de navegador. `npm run test:all` usa PostgreSQL además de SQLite cuando está disponible: inicia automáticamente el clúster local (`scripts/pg-local.sh`); para usar otro servidor defina `TEST_DATABASE_URL` (rol con `CREATEDB`) y `TEST_PG_BASE_URL`. La prueba de `sslmode=verify-full` necesita el certificado de ese servidor: por defecto `.pgdata/server.crt`, o la carpeta indicada en `PGLOCAL_DIR`.

Las pruebas de integración usan una **base de datos PostgreSQL temporal por suite** (creada y eliminada automáticamente) y un **reloj falso** (para expiración de sesiones, bloqueo y cronómetros). Las E2E usan **dos servidores aislados** (puertos 3100 y 3101) con bases sembradas desde cero en cada ejecución: nunca tocan la base de datos real.

Toda prueba E2E falla automáticamente si aparece un error de JavaScript o de consola no esperado (fixture `consoleErrors`). Los recursos externos (fuentes, logo) se bloquean para que las pruebas sean deterministas.

## Flujos E2E cubiertos

| # | Flujo | Archivo |
|---|---|---|
| 1 | Acceso, validación del formulario, credenciales incorrectas | auth.spec.ts |
| 2 | Autenticación, persistencia de sesión al recargar, cierre de sesión | auth.spec.ts |
| 3 | Navegación entre semanas, atajos, ayuda, semana cerrada | views.spec.ts |
| 4 | Creación (borrador + autoguardado, alta rápida) | tasks.spec.ts |
| 5 | Consulta (indicadores, lista, tablero, carga) | views.spec.ts |
| 6 | Edición (estado, avance, fecha, descripción, justificación) | tasks.spec.ts |
| 7 | Eliminación con «Deshacer» | tasks.spec.ts |
| 8 | Búsquedas y filtros por persona | views.spec.ts |
| 9 | Validaciones (nombre obligatorio, descarte de borrador, formularios de admin) | tasks.spec.ts, weeks-admin.spec.ts |
| 10 | Manejo de errores (500 simulado con reversión; sesión expirada) | errors-responsive.spec.ts |
| 11 | Permisos por rol (crear semana, eliminar ajenas, tiempo ajeno, menú admin) | weeks-admin.spec.ts, time.spec.ts, tasks.spec.ts |
| 12 | Persistencia (recargar tras crear, editar, registrar tiempo, restaurar) | tasks.spec.ts, time.spec.ts |
| 13 | Responsive (tablet y móvil sin desborde, panel a pantalla completa) | errors-responsive.spec.ts, visual.spec.ts |
| + | Registro de tiempo y cronómetro; arrastrar y soltar en tablero; crear semana con pendientes; alta de persona y cambio de capacidad | time.spec.ts, views.spec.ts, weeks-admin.spec.ts |

## Comandos

| Comando | Acción |
|---|---|
| `npm run lint` | Análisis estático (12 reglas) |
| `npm run typecheck` | TypeScript estricto sin emitir |
| `npm test` | Unitarias |
| `npm run test:integration` | Integración |
| `npm run test:coverage` | Unitarias + integración con cobertura y umbrales → `coverage/lcov.info`, `coverage/summary.md` |
| `npm run test:e2e` | Build + E2E |
| `npm run test:visual` | Build + visuales (comparación con referencias) |
| `npx playwright test --project=visual --update-snapshots` | Regenerar capturas de referencia tras un cambio visual intencional |
| `npm run test:all` | Batería completa en orden: PostgreSQL local → lint → typecheck → unitarias → integración → cobertura → build → E2E → visuales |

Reportes: `playwright-report/index.html` (HTML de Playwright), `test-results/` (trazas y capturas de fallos), `docs/evidence/` (capturas de evidencia), `docs/reports/` (salida de la última batería y resumen de cobertura).

## Cobertura

Medida con V8 sobre `src/server/**` y `src/shared/**` (se excluyen los scripts de línea de comandos y el arranque). Umbrales que hacen fallar la ejecución: líneas ≥ 80 %, funciones ≥ 80 %, ramas ≥ 70 %, y lógica de negocio ≥ 90 % de líneas.

| Grupo | Líneas | Funciones | Ramas |
|---|---:|---:|---:|
| Global (servidor + compartido) | 97,7 % | 95,4 % | 90,3 % |
| Lógica de negocio (rules, weeks, validation, services) | 99,2 % | 98,9 % | 93,4 % |
| Repositorios y base de datos | 99,0 % | 93,6 % | 90,9 % |
| Cliente PostgreSQL nativo | 95,5 % | 90,7 % | 89,2 % |
| Capa HTTP | 95,0 % | 97,3 % | 82,4 % |

Detalle por archivo: [`docs/reports/coverage-summary.md`](reports/coverage-summary.md).

**Limitación:** el código de la interfaz (`src/client`) no se instrumenta con cobertura; se valida mediante las 38 pruebas de navegador (E2E + visuales). Ver KNOWN_ISSUES.

## Política ante fallos

Analizar la causa raíz → corregir → reejecutar la prueba afectada → reejecutar la batería completa. Ninguna prueba está omitida (`.skip`/`.only` están prohibidos por lint y por `forbidOnly`).
