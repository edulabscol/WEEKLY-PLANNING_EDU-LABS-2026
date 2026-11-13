# Base de datos: SQLite en local, PostgreSQL 16 en el servidor

Desde la versión 1.2.0 la aplicación funciona con **dos motores**, elegidos por `DATABASE_URL`:

| Entorno | Motor | `DATABASE_URL` |
|---|---|---|
| Desarrollo local (por defecto) | **SQLite** incluido en Node (`node:sqlite`), sin instalar nada | `sqlite:./data/planeacion.db` |
| Servidor | **PostgreSQL 16** (probado con 16.15; compatible con 16.13) | `postgres://planeacion_app:…@host:5432/planeacion?sslmode=verify-full` |

Ambos usan el mismo código de aplicación y el mismo SQL en los repositorios; cada motor tiene su migración con **las mismas tablas, columnas y reglas** (`src/server/db/migrations.ts`). Toda la batería de pruebas se ejecuta contra los dos. En producción se recomienda PostgreSQL (el servidor lo advierte en el log si usa SQLite con `NODE_ENV=production`).

### SQLite en desarrollo

- El archivo se crea solo (`data/planeacion.db`, modo WAL, claves foráneas activas).
- Una sola conexión: las transacciones se serializan para que ninguna consulta vea datos sin confirmar.
- Los errores de SQLite se traducen a los mismos códigos que PostgreSQL, así que la API responde igual.
- Respaldo: `npm run db:backup` (copia consistente en caliente). Reiniciar con datos de demostración: `npm run db:reset`.
- Para pasar los datos de prueba al servidor no se migran archivos: en el servidor se crea el administrador y se trabaja desde cero (los datos locales son de demostración).

## PostgreSQL

### 1. Cómo se conecta

La aplicación incluye su **propio cliente PostgreSQL** (`src/server/db/pg/`), escrito sobre `node:net`/`node:tls`, sin dependencias npm. Implementa:

| Capacidad | Detalle |
|---|---|
| Protocolo | v3, consultas extendidas (Parse/Bind/Execute) con **parámetros siempre separados del SQL** |
| Autenticación | **SCRAM-SHA-256** (por defecto en PostgreSQL 14+; verificada con el vector del RFC 7677), MD5 y contraseña en claro si el servidor la exige |
| SSL/TLS | `sslmode=disable`, `prefer` (por defecto), `require` (cifra), `verify-full` (cifra y valida certificado **y** nombre del host; CA con `sslrootcert`) |
| Pool | Máximo configurable (`DB_POOL_MAX`), cola de espera con tiempo límite, cierre de conexiones inactivas, descarte de conexiones caídas, `ROLLBACK` automático si una conexión vuelve con una transacción abierta |
| Sesión | `TimeZone=UTC`, `DateStyle=ISO`, `client_encoding=UTF8`, `statement_timeout` (`DB_STATEMENT_TIMEOUT_MS`), `application_name=planeacion-semanal` |
| Transacciones | `BEGIN/COMMIT/ROLLBACK` con anidamiento por `SAVEPOINT`; todas las consultas de una transacción usan la misma conexión |
| Errores | Código SQLSTATE; la API traduce `23505`→409, `23503`/`23514`→422, `22P02`→400, `40001`/`40P01`→409, `57014`→503, sin conexión→503 |

¿Por qué no la librería `pg`? El entorno de construcción no tenía acceso a npm. El cliente propio se probó contra un PostgreSQL 16 real (51 pruebas de integración + 38 de navegador). Si su organización prefiere `pg`, el cambio se limita a `src/server/db/database.ts`.

### `DATABASE_URL`

```
postgres://USUARIO:CLAVE@HOST:5432/BASE?sslmode=verify-full&sslrootcert=/ruta/ca.pem
```

- Caracteres especiales en usuario/clave: codifíquelos (`@`→`%40`, `:`→`%3A`, `/`→`%2F`).
- En producción use `sslmode=require` como mínimo; el servidor registra una advertencia si la conexión a un host remoto no exige cifrado.

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | — (obligatoria) | Conexión |
| `DB_POOL_MAX` | 10 | Conexiones simultáneas por instancia |
| `DB_STATEMENT_TIMEOUT_MS` | 15000 | Tiempo máximo por sentencia |
| `DB_CONNECT_TIMEOUT_MS` | 10000 | Tiempo máximo para conectar / esperar una conexión libre |
| `DB_AUTO_MIGRATE` | true | `true`: el servidor migra al iniciar. `false`: exige el esquema al día (roles separados) |

### 2. Preparación del servidor (una vez)

El script [`deploy/postgres/01-create-database.sql`](../deploy/postgres/01-create-database.sql) crea, con **mínimo privilegio**:

| Objeto | Propósito |
|---|---|
| Rol `planeacion_owner` | Dueño del esquema. Solo para migraciones y respaldos |
| Rol `planeacion_app` | El que usa la aplicación: `SELECT/INSERT/UPDATE/DELETE`, sin DDL; `statement_timeout` 15 s; máx. 50 conexiones |
| Base `planeacion` (UTF-8) | Sin acceso para `PUBLIC` |
| Esquema `planeacion` | Las tablas viven aquí (no en `public`); `search_path` configurado por rol |
| Privilegios por defecto | Toda tabla futura creada por el propietario queda accesible para la aplicación |

```bash
psql -h <servidor> -U postgres \
     -v owner_password='<clave-larga-1>' -v app_password='<clave-larga-2>' \
     -f deploy/postgres/01-create-database.sql
```

Después, en `pg_hba.conf`, permita solo conexiones cifradas desde el servidor de la aplicación y recargue:

```
hostssl  planeacion  planeacion_app,planeacion_owner  <IP-del-servidor-app>/32  scram-sha-256
```

```sql
SELECT pg_reload_conf();
```

Verificado en este proyecto: con estos roles, `planeacion_app` no puede crear ni borrar tablas (`must be owner of table`, `permission denied for schema`), y la aplicación funciona completa con `DB_AUTO_MIGRATE=false`.

> Instalación sencilla (un solo rol dueño de la base, `DB_AUTO_MIGRATE=true`) también funciona, pero en producción se recomiendan los dos roles.

### 3. Migraciones

- Definidas en `src/server/db/migrations.ts`; registradas en `schema_migrations`; cada una en su transacción.
- Protegidas por un bloqueo consultivo (`pg_advisory_xact_lock`): dos instancias no migran a la vez.
- Ejecutar con el **rol propietario**:

```bash
DATABASE_URL='postgres://planeacion_owner:...@host/planeacion?sslmode=require' npm run db:migrate
# o, ya compilado:
DATABASE_URL='...' node dist/cli/migrate.js
```

- El esquema completo, legible para revisión del DBA: [`deploy/postgres/schema.sql`](../deploy/postgres/schema.sql) (generado; una prueba verifica que coincide con las migraciones). Regenerar: `npm run db:schema`.
- Regla: nunca edite una migración publicada; agregue una nueva (aditiva y compatible hacia atrás).

### 4. Modelo de datos

| Tabla | Tipos y restricciones principales |
|---|---|
| `users` | `id uuid`, `email varchar(160)` único y en minúsculas (CHECK), `role` ∈ {admin, member}, `color` `^#[0-9A-F]{6}$`, `in_team`/`active boolean`, `locked_until timestamptz` |
| `sessions` | `id char(64)` = SHA-256 del token, FK a `users` `ON DELETE CASCADE`, índice por `expires_at` |
| `settings` | clave/valor |
| `weeks` | `id varchar(8)` `^[0-9]{4}-W[0-9]{2}$`, `monday date` único y **debe ser lunes** (CHECK `isodow = 1`) |
| `tasks` | `id uuid`, FK a semana `CASCADE`, `status`/`priority`/`type` con CHECK, `progress smallint 0..100`, **CHECK `(status='done') = (progress=100)`**, no puede justificar su propio retraso, `deleted_at` (borrado lógico), índice parcial por semana para tareas activas |
| `task_assignees` | PK (tarea, persona), `estimate_minutes 0..12000`, persona `ON DELETE RESTRICT` |
| `time_entries` | `bigint identity`, `seconds integer`, `source` con CHECK, FK compuesta a la asignación `CASCADE` |
| `timers` | PK `owner_id`, `UNIQUE (task_id, user_id)`, FK compuesta a la asignación |
| `audit_log` | `bigint identity`, `details jsonb`, índices por fecha y entidad |

Todas las fechas-hora son `timestamptz` (la aplicación trabaja en UTC y calcula «hoy» con `APP_TIMEZONE`); las fechas de vencimiento son `date`. Las columnas `seq` (`GENERATED ALWAYS AS IDENTITY`) dan un orden estable de creación.

### 5. Respaldos y restauración

```bash
# Respaldo (pg_dump 16+, formato custom comprimido). Use el rol propietario.
DATABASE_URL='postgres://planeacion_owner:...' npm run db:backup -- /ruta/respaldos   # o: node dist/cli/backup.js /ruta
# Conserva los últimos BACKUP_KEEP (14) archivos planeacion-*.dump

# Restaurar sobre la base existente (detenga la aplicación antes)
pg_restore --clean --if-exists --no-owner --role=planeacion_owner -d 'postgres://planeacion_owner:...@host/planeacion' planeacion-AAAA.dump
```

En Docker Compose de producción, el servicio `backup` (imagen `postgres:16-alpine`) hace un respaldo diario. Recomendado: copiar los respaldos fuera del servidor y probar una restauración cada mes. Si su servidor ya tiene respaldos físicos/PITR (pgBackRest, Barman, WAL archiving), puede prescindir del servicio `backup`.

### 6. Desarrollo y pruebas

- `npm run db:local` (o `bash scripts/pg-local.sh start`): clúster PostgreSQL 16 desechable en `.pgdata/`, puerto 54329, SCRAM y SSL con certificado autofirmado. Requiere los binarios de PostgreSQL 16 (`initdb`, `pg_ctl`).
- Alternativa: `docker compose up db`.
- Las pruebas usan SQLite por defecto. `npm run test:integration:pg` (o `TEST_DB=postgres`) repite las de integración contra PostgreSQL: crean **una base temporal por suite** (`planeacion_test_<aleatorio>`) y la eliminan al terminar; necesitan un rol con `CREATEDB` en `TEST_DATABASE_URL` (por defecto, el clúster local). Nunca usan la base real.
- Las E2E usan SQLite (`test-results/db/`); con `E2E_DB=postgres`, las bases `planeacion_e2e` y `planeacion_visual` (`TEST_PG_BASE_URL`).
- `npm run db:reset` **borra** las tablas de la aplicación y vuelve a sembrar (bloqueado en producción).
