# Despliegue en un servidor con PostgreSQL 16

> En su computador la aplicación usa SQLite (`npm run dev`, ver README). En el servidor se usa PostgreSQL: basta con definir `DATABASE_URL=postgres://…`; no hay que cambiar código.

> ⚠️ Los archivos Docker/Compose/Caddy/systemd están listos pero **no se ejecutaron** en el entorno de construcción (no había daemon de Docker). La aplicación, las migraciones, los roles del DBA, `verify-full` y `pg_dump` **sí se probaron** contra PostgreSQL 16 real. Valide en *staging* antes de producción. Este documento no autoriza ningún despliegue: requiere su confirmación expresa.

## 1. Requisitos

- **PostgreSQL 16** (su servidor 16.13 es compatible).
- Node.js **22.18+** en el servidor de la aplicación (o Docker 24+).
- Cliente `pg_dump` 16 para respaldos (`postgresql-client-16`), si no usa el servicio `backup` de Compose.
- Un dominio apuntando al servidor de la aplicación y puertos 80/443 abiertos (HTTPS con Caddy).

## 2. Preparar PostgreSQL (DBA, una sola vez)

```bash
psql -h <servidor-pg> -U postgres \
     -v owner_password='<clave-larga-1>' -v app_password='<clave-larga-2>' \
     -f deploy/postgres/01-create-database.sql
```

Crea la base `planeacion`, el esquema `planeacion` y dos roles: `planeacion_owner` (migraciones/respaldos) y `planeacion_app` (solo datos). Luego agregue a `pg_hba.conf` y recargue (`SELECT pg_reload_conf();`):

```
hostssl  planeacion  planeacion_app,planeacion_owner  <IP-servidor-app>/32  scram-sha-256
```

Para `sslmode=verify-full`, copie al servidor de la aplicación el certificado de la CA que firmó el certificado de PostgreSQL (p. ej. `/etc/planeacion/pg-ca.pem`). Detalle completo en [DATABASE.md](DATABASE.md).

## 3. Variables de entorno de producción

| Variable | Valor recomendado | Nota |
|---|---|---|
| `NODE_ENV` | `production` | Cookie `Secure`, HSTS, ignora `APP_TODAY`, impide datos de demostración |
| `DATABASE_URL` | `postgres://planeacion_app:<clave>@<pg-host>:5432/planeacion?sslmode=verify-full&sslrootcert=/etc/planeacion/pg-ca.pem` | Rol de la aplicación. Mínimo `sslmode=require` |
| `DB_AUTO_MIGRATE` | `false` | Las migraciones las aplica el propietario (§5) |
| `DB_POOL_MAX` | `10` | Debe ser menor que el `CONNECTION LIMIT` del rol (50) × instancias |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Detrás del proxy |
| `APP_TIMEZONE` | `America/Bogota` | Define «hoy» |
| `TRUST_PROXY` | `true` | Solo con proxy inverso |
| `COOKIE_SECURE` | `true` | Requiere HTTPS |
| `SESSION_TTL_HOURS` | `12` | |
| `LOGIN_RATE_LIMIT` / `API_RATE_LIMIT` | `10` / `600` | |
| `LOG_LEVEL` | `info` | Logs JSON a stdout |

No versione el `.env` de producción. Codifique en la URL los caracteres especiales de la clave (`@`→`%40`, `:`→`%3A`, `/`→`%2F`).

## 4. Opción A — Docker Compose con HTTPS (contra su PostgreSQL)

```bash
cat > .env.prod <<'EOF'
DOMAIN=planeacion.suempresa.com
ACME_EMAIL=ti@suempresa.com
APP_TIMEZONE=America/Bogota
DATABASE_URL=postgres://planeacion_app:CLAVE_APP@db.suempresa.local:5432/planeacion?sslmode=require
MIGRATE_DATABASE_URL=postgres://planeacion_owner:CLAVE_OWNER@db.suempresa.local:5432/planeacion?sslmode=require
EOF
chmod 600 .env.prod

# 1) Migraciones con el rol propietario
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
# 2) Aplicación + Caddy (HTTPS) + respaldos diarios
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# 3) Primer administrador (una vez)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec \
  -e ADMIN_EMAIL=coordinacion@suempresa.com -e ADMIN_NAME="Coordinación" -e ADMIN_PASSWORD='***' \
  app node dist/cli/create-admin.js
# 4) Verificar
curl -fsS https://planeacion.suempresa.com/api/health
```

Si PostgreSQL está en el mismo equipo que Docker, use `host.docker.internal` como host (ya mapeado en el Compose) y permita en `pg_hba.conf` la red del puente de Docker.

## 5. Opción B — Servidor Linux con systemd

```bash
# Compilar (en una máquina con red)
npm ci && npm run build
# Copiar dist/, package.json y .env a /opt/planeacion (usuario de sistema "planeacion")

# Migraciones con el rol propietario
cd /opt/planeacion
DATABASE_URL='postgres://planeacion_owner:...@host/planeacion?sslmode=require' node dist/cli/migrate.js

# Primer administrador (usa el .env con el rol de la aplicación)
ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... node dist/cli/create-admin.js

sudo cp deploy/planeacion.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now planeacion
```

Ponga un proxy inverso con TLS delante (Caddy, Nginx) y `TRUST_PROXY=true`.

## 6. Respaldos

- Compose: servicio `backup` (`postgres:16-alpine`) con `pg_dump` diario en `./backups`, conserva 14 días.
- Manual: `DATABASE_URL=<rol propietario> node dist/cli/backup.js /ruta`.
- Restaurar y recomendaciones: [DATABASE.md §5](DATABASE.md#5-respaldos-y-restauración). Si su servidor ya tiene PITR, prefiera esa estrategia.

## 7. Política de despliegue

1. `npm run test:all` en verde.
2. Imagen con etiqueta de versión (`planeacion:1.1.0`).
3. Respaldo previo.
4. **Migraciones primero** (rol propietario), luego la aplicación. Las migraciones deben ser compatibles con la versión anterior durante un despliegue (agregar antes de usar; no renombrar ni borrar en el mismo paso).
5. *Staging* → `/api/health` y recorrido básico → producción.

## 8. Rollback

1. Volver a la imagen/versión anterior de la aplicación.
2. Si la nueva versión aplicó una migración incompatible: detener la aplicación, restaurar el respaldo previo (`pg_restore --clean --if-exists`), iniciar la versión anterior.
3. Verificar `/api/health` e inicio de sesión.

## 9. Observabilidad

- Logs JSON (`docker compose logs -f app`): `requestId`, método, ruta, estado, duración, usuario, IP; sin contraseñas ni tokens. Al iniciar se registra host, base y `sslmode`, y una advertencia si la conexión remota no exige cifrado.
- Base de datos caída → la API responde 503 `database_unavailable` y se recupera sola cuando PostgreSQL vuelve (el pool descarta conexiones rotas).
- En PostgreSQL, las conexiones aparecen con `application_name = 'planeacion-semanal'` (`SELECT * FROM pg_stat_activity WHERE application_name LIKE 'planeacion%'`).
- Salud: `GET /api/health` → `{ status, db, version, time }`.
