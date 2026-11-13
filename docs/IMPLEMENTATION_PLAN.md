# Plan de implementación y estado

## Registro de avance

| Fase | Descripción | Estado |
|---|---|---|
| 1 | Auditoría del prototipo | ✅ Completada |
| 2 | Arquitectura y planificación | ✅ Completada |
| 3 | Configuración del entorno | ✅ Completada (dependencias enlazadas sin red; ver DT-07/08) |
| 4 | Desarrollo frontend | ✅ Completada |
| 5 | Desarrollo backend | ✅ Completada |
| 6 | Persistencia e integraciones | ✅ Completada (PostgreSQL 16 desde v1.1.0; sin integraciones externas requeridas) |
| 7 | Seguridad | ✅ Completada (auditoría de dependencias con `npm audit` pendiente: requiere red) |
| 8 | Testing automatizado | ✅ Completada |
| 9 | Validación funcional | ✅ Completada |
| 10 | Preparación para producción | ✅ Configuración lista · ⚠️ Docker no ejecutado (sin daemon en el entorno) |
| 11 | Documentación y entrega | ✅ Completada |

> Nota de método: la auditoría y el plan se hicieron antes de escribir código; estos documentos se redactaron con el resultado final para reflejar lo realmente implementado.

## Funcionalidades, prioridad, dependencias y criterios de aceptación

| # | Funcionalidad | Prioridad | Depende de | Criterio de aceptación | Estado |
|---|---|---|---|---|---|
| 1 | Esquema, migraciones, semilla | Alta | — | Base creada por migración; semilla reproduce el prototipo (19 tareas, 44,5 h de Yerson) | ✅ I |
| 2 | Autenticación y sesiones | Alta | 1 | Login/logout, cookie HttpOnly, expiración, bloqueo, CSRF | ✅ I/E |
| 3 | Semanas ISO y navegación | Alta | 1 | Semana actual según zona horaria; rangos correctos en cambio de año | ✅ U/E |
| 4 | CRUD de tareas con reglas | Alta | 1,2 | Reglas estado↔avance en servidor; validación por campo; deshacer | ✅ U/I/E |
| 5 | Responsables y tiempo | Alta | 4 | Estimado/real por persona; permisos sobre tiempo ajeno | ✅ I/E |
| 6 | Cronómetro | Alta | 5 | Uno por usuario; persiste al recargar; tope por olvido | ✅ I/E |
| 7 | Crear semana con arrastre | Alta | 3,4 | Pendientes arrastradas con estimado restante (mín. 1 h), marcas ↻/→, atómico | ✅ I/E |
| 8 | Vistas Lista/Tablero/Carga | Alta | 4,5 | Paridad visual con el prototipo; DnD; estados de capacidad | ✅ E/V |
| 9 | Búsqueda, filtros, indicadores | Media | 8 | Resultados correctos; indicadores = fórmulas del prototipo | ✅ U/E |
| 10 | Justificación de retrasos | Media | 4 | Solo adicionales de la misma semana | ✅ I/E |
| 11 | Administración (personas, ajustes, auditoría) | Media | 2 | Solo Coordinación; último admin protegido; paginación | ✅ I/E |
| 12 | Responsive y accesibilidad básica | Media | 8 | Sin desbordes en 4 resoluciones; nombres accesibles | ✅ E/V |
| 13 | Producción (Docker, HTTPS, respaldos, salud) | Media | 1–11 | Archivos listos y documentados | ✅ / ⚠️ sin ejecutar Docker |

## Riesgos identificados

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sin acceso a npm en el entorno | No usar Prisma/Zod/ESLint/Vitest | Equivalentes nativos (DT-02…DT-09), documentados |
| Cliente PostgreSQL propio (sin `pg`) | Casos de borde del protocolo | 9 pruebas contra servidor real + vector RFC 7677; sustituible por `pg` en un solo archivo |
| Logo y fuentes remotos | Dependencia de terceros | Degradación elegante (logo textual, fuentes del sistema) |
| Cronómetros olvidados | Horas infladas | Tope `TIMER_MAX_HOURS` y aviso al detener |

## Historial de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0.0 | 11 nov 2026 | Primera entrega (SQLite) |
| 1.1.0 | 13 nov 2026 | **Migración a PostgreSQL 16**: esquema con tipos nativos y restricciones con nombre, cliente PostgreSQL nativo (SCRAM, TLS, pool), capa de datos asíncrona con transacciones y savepoints, roles separados y script para el DBA, respaldos con `pg_dump`, Docker Compose con PostgreSQL, pruebas sobre PostgreSQL real |
| 1.2.0 | 13 nov 2026 | **SQLite para desarrollo local + PostgreSQL 16 para servidor** con el mismo código (selección por `DATABASE_URL`); instaladores para Windows/macOS/Linux (`instalar.ps1`, `instalar.sh`, `npm run setup`); pruebas en ambos motores; Docker local con SQLite |
