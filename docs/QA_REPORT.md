# Informe de QA

## v1.3.0 — Sprints con nombre editable (13 nov 2026)

`npm run test:all` ✅ ([`reports/check-all.log`](reports/check-all.log)): lint y typecheck sin errores · unitarias 62/62 · integración **SQLite 55/55** y **PostgreSQL 64/64** · cobertura (PostgreSQL) 98,0 % líneas, lógica de negocio 99,3 % · E2E 32/32 y visuales 8/8. Nuevas pruebas: numeración Sprint 0/1/2, renombrar (permisos, validación 1–60, auditoría, 404 sin tablero), migración 2 sobre bases existentes en ambos motores, edición en línea (Enter, Esc, salir del campo, recarga) y caché de recursos (`?v=<hash>` inmutable; `?v=dev…` y sin versión, `no-cache`). Corregido: en desarrollo el navegador conservaba la interfaz anterior por la caché inmutable de `app.js?v=dev`.

## v1.2.0 — SQLite en local + PostgreSQL en servidor (13 nov 2026)

`npm run test:all` ✅ ([`reports/check-all.log`](reports/check-all.log)): lint y typecheck sin errores · unitarias 59/59 · integración **SQLite 50/50** y **PostgreSQL 59/59** · cobertura (PostgreSQL) 97,9 % líneas, lógica de negocio 99,2 %; (solo SQLite) 98,3 % · E2E 30/30 y visuales 8/8 con SQLite, y también 38/38 con `E2E_DB=postgres`. Verificado además: `npm run setup` desde cero y `npm run dev` (SQLite, datos de demostración automáticos, recarga al guardar).

| # | Problema | Causa | Corrección | Detectado por |
|---|---|---|---|---|
| 1 | En SQLite las columnas de fecha de creación no tenían valor por defecto (en PostgreSQL sí) | Diferencia entre las dos migraciones | Mismos valores por defecto en ambos motores | Prueba de integridad ejecutada en ambos motores |
| 2 | Las rutas de los scripts fallarían en Windows (`/C:/…`) | Uso de `URL.pathname` | `fileURLToPath` | Revisión para instalación en Windows |
| 3 | Prueba E2E con condición de carrera al contar pendientes | Se contaba antes de que la lista se pintara | Esperar a la lista | E2E |


## v1.1.0 — Migración a PostgreSQL 16 (13 nov 2026)

**Entorno:** PostgreSQL 16.15 real (SCRAM-SHA-256, SSL), Node 22.23.4, Chromium · **Comando:** `npm run test:all` · **Resultado:** ✅ todas las etapas pasaron ([`reports/check-all.log`](reports/check-all.log)).

| Etapa | Resultado |
|---|---|
| Lint (82 archivos) · Typecheck | ✅ 0 problemas · 0 errores |
| Unitarias | ✅ 59/59 (incluye cliente PostgreSQL y vector SCRAM del RFC 7677) |
| Integración (PostgreSQL real, base temporal por suite) | ✅ 51/51 |
| Cobertura | ✅ líneas 97,7 % · funciones 95,4 % · ramas 90,3 % · lógica de negocio 99,2 % · cliente PostgreSQL 95,5 % |
| Build | ✅ |
| E2E / Visuales (PostgreSQL) | ✅ 30/30 · 8/8 (las capturas coinciden con la referencia: la interfaz no cambió) |

**Verificación manual del despliegue con roles separados** (sobre PostgreSQL 16): ejecución de `deploy/postgres/01-create-database.sql` → migración con `planeacion_owner` → creación de administrador y servidor con `planeacion_app`, `DB_AUTO_MIGRATE=false` y `sslmode=verify-full` → inicio de sesión y creación de semana por la API → el rol de la aplicación **no** puede `DROP TABLE` ni `CREATE TABLE` → respaldo con `pg_dump` (10 tablas con datos).

**Defectos encontrados y corregidos en esta versión:**

| # | Problema | Causa | Corrección | Detectado por |
|---|---|---|---|---|
| 1 | Con `sslmode=verify-full` hacia una **IP**, no se validaba el nombre del certificado | Sin `host` explícito, Node compara el certificado contra «localhost» | Verificación siempre contra el host configurado | Prueba de integración del cliente |
| 2 | Una conexión que debía rechazarse quedaba abierta y colgaba el proceso | Consecuencia del defecto 1 | Corregido con 1 | Prueba de integración |
| 3 | El script de lint marcaba listas de columnas constantes como SQL concatenado | Regla sin excepciones para constantes | Lista permitida + `quoteIdent` para identificadores | Lint |

---

## v1.0.0 — Entrega inicial (SQLite)

**Fecha:** 11 nov 2026 · **Entorno:** Linux, Node 22.23.4, Chromium (Playwright 1.63) · **Comando:** `npm run test:all` · **Resultado:** ✅ todas las etapas pasaron (salida completa en [`reports/check-all.log`](reports/check-all.log)).

## Resultados

| Etapa | Resultado |
|---|---|
| Lint (72 archivos, 12 reglas) | ✅ 0 problemas |
| Typecheck (TypeScript estricto) | ✅ 0 errores |
| Unitarias | ✅ 47/47 |
| Integración | ✅ 40/40 |
| Cobertura (87 pruebas) | ✅ líneas 98,4 % · funciones 97,7 % · ramas 90,9 % · lógica de negocio 99,2 % |
| Build de producción | ✅ `app.js` 285 KB (minificado) · `app.css` 1,4 KB · `server.js` |
| E2E (Chromium) | ✅ 30/30 |
| Visuales (4 resoluciones, 32 capturas comparadas con referencia) | ✅ 8/8 |
| Pruebas omitidas o deshabilitadas | 0 |

## Validación funcional en navegador

Además de las pruebas automatizadas, se levantó la aplicación con `scripts/start.sh` usando la **fecha real** (11 nov 2026 → Semana 46) y se recorrió en Chromium: inicio de sesión, lista, tablero, carga, detalle; consola sin errores. Se comprobó también el reinicio (`stop` → `start`) conservando los datos, y `GET /api/health`.

Evidencias visuales: [`docs/evidence/`](evidence/) (32 capturas: `desktop`, `laptop`, `tablet`, `mobile` × login, lista, tablero, carga, detalle, ayuda, semana nueva, equipo).

## Problemas detectados y corregidos

| # | Problema | Tipo | Causa raíz | Corrección | Detectado por |
|---|---|---|---|---|---|
| 1 | Las rutas de administración devolvían 422 (validación) a un colaborador en vez de 403 | Seguridad | Se validaba el cuerpo antes de comprobar el rol, revelando el formato esperado | Comprobación de rol antes de validar en `/api/users`, `/api/settings`, `/api/audit`, `/api/weeks` | Integración |
| 2 | Al editar el tiempo real pasando de «h» a «min», se guardaban minutos con las horas anteriores | Funcional (pérdida de datos) | Al salir del campo de horas se descartaba la edición local antes de que llegara la respuesta del servidor | Guardar solo al salir de los campos de la persona y descartar la edición local cuando llega el valor del servidor | E2E |
| 3 | Chips del equipo con nombre accesible duplicado («Wilson Wilson») | Accesibilidad | El avatar tenía su propia etiqueta dentro de un botón con texto | Avatar decorativo (`aria-hidden`) dentro de controles con nombre | E2E |
| 4 | Error 401 en consola al abrir la pantalla de inicio de sesión | Calidad | Se usaba `/api/bootstrap` para saber si había sesión | Nuevo endpoint público `/api/auth/session` | Revisión en navegador |
| 5 | Total de horas partido en dos líneas en «Carga del equipo» | Visual | Faltaba `white-space: nowrap` | Corregido | Captura de pantalla |
| 6 | La carga de datos semilla fallaba por clave foránea | Datos | Se marcaba «Pasó a S45» antes de crear la semana 45 | Crear todas las semanas antes de las tareas | Ejecución del seed |
| 7 | Orden del equipo distinto al del prototipo | Funcional | Orden alfabético en lugar de orden de alta | Ordenar por fecha de alta y `rowid` | Prueba manual |
| 8 | Coordinación no podía restablecer la contraseña de otra persona desde la interfaz (solo por API) | Funcional | Faltaba el control en el panel | Botón «Contraseña» por persona en «Equipo y ajustes», con validación y cierre de sesiones de esa persona | Revisión de flujos |
| 9 | Prueba E2E con condición de carrera al navegar semanas | Pruebas | Se comprobaba el estado vacío antes de terminar la carga | Esperar fin de carga; suite ejecutada 3 veces seguidas sin fallos | E2E |
| 10 | Regla de lint con falsos positivos (savepoints, cliente HTTP) | Herramientas | Patrón demasiado amplio | Restringida a llamadas de base de datos | Lint |

Errores de las propias pruebas corregidos (no eran defectos del producto): asunción de que 2026 tiene 52 semanas ISO (tiene 53), número de pendientes esperado (13, no 12), sesión expirada por avanzar 30 h el reloj falso, selector ambiguo en Playwright, mediciones de layout durante la animación del panel.

## Seguridad verificada por pruebas

CSRF sin/erróneo → 403 · Origen ajeno → 403 · Sin sesión → 401 · Expiración y revocación de sesiones · Bloqueo tras 5 intentos · Límite de intentos (429) y límite general de API (429) · Inyección SQL almacenada como texto · Path traversal → 404 · Cuerpo > 100 KB → 413 · JSON inválido → 400 · `Content-Type` incorrecto → 415 · Cabeceras CSP/nosniff/DENY · No se exponen hashes de contraseña · Permisos por rol y por recurso.

## No ejecutado (y por qué)

| Verificación | Motivo | Acción sugerida |
|---|---|---|
| `npm audit` | Sin acceso a la red | Ejecutar `npm run audit:deps` en una máquina con red (dependencias en ejecución: solo `react` y `react-dom`) |
| Construcción y arranque con Docker | Sin daemon de Docker en el entorno | `docker compose up --build` en *staging* |
| Pruebas en Firefox/Safari | Solo Chromium disponible | Agregar proyectos `firefox`/`webkit` en `playwright.config.ts` |
| Logo y fuentes reales en las capturas | Recursos externos bloqueados en pruebas | Revisión visual manual con red |
