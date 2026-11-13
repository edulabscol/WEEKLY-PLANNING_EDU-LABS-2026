#!/usr/bin/env bash
# Clúster PostgreSQL local y desechable para desarrollo y pruebas (no para producción).
# Requiere los binarios de PostgreSQL 16 (initdb, pg_ctl). Uso: scripts/pg-local.sh start|stop|status|url
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/16/bin 2>/dev/null || dirname "$(command -v initdb)")}"
DIR="${PGLOCAL_DIR:-$PWD/.pgdata}"
PORT="${PGLOCAL_PORT:-54329}"
USER_NAME="${PGLOCAL_USER:-planeacion}"
PASS="${PGLOCAL_PASSWORD:-planeacion_local}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then  # postgres no se ejecuta como root
  id pglocal >/dev/null 2>&1 || useradd -r -M -s /usr/sbin/nologin pglocal
  RUN_AS=(runuser -u pglocal --)
fi
url() { echo "postgres://$USER_NAME:$PASS@127.0.0.1:$PORT/${1:-planeacion}"; }
case "${1:-start}" in
  start)
    if [ ! -f "$DIR/PG_VERSION" ]; then
      mkdir -p "$DIR"; [ ${#RUN_AS[@]} -gt 0 ] && chown pglocal "$DIR"
      PWFILE=$(mktemp); echo "$PASS" > "$PWFILE"; chmod 644 "$PWFILE"
      "${RUN_AS[@]}" "$PGBIN/initdb" -D "$DIR" -U "$USER_NAME" --pwfile="$PWFILE" --auth=scram-sha-256 -E UTF8 --locale=C.UTF-8 >/dev/null
      rm -f "$PWFILE"
      # Certificado autofirmado para probar conexiones SSL
      openssl req -new -x509 -days 365 -nodes -subj "/CN=localhost" -keyout "$DIR/server.key" -out "$DIR/server.crt" >/dev/null 2>&1
      chmod 600 "$DIR/server.key"; [ ${#RUN_AS[@]} -gt 0 ] && chown pglocal "$DIR/server.key" "$DIR/server.crt"
      printf "ssl = on\nunix_socket_directories = '%s'\nlisten_addresses = '127.0.0.1'\nport = %s\nmax_connections = 200\nfsync = off\n" "$DIR" "$PORT" >> "$DIR/postgresql.conf"
    fi
    "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" -w status >/dev/null 2>&1 || "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" -w start >/dev/null
    PGPASSWORD="$PASS" psql -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='planeacion'" | grep -q 1 \
      || PGPASSWORD="$PASS" psql -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -qc "CREATE DATABASE planeacion"
    echo "PostgreSQL local listo: $(url)";;
  stop) "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DIR" -w stop >/dev/null && echo "PostgreSQL local detenido";;
  status) "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DIR" status;;
  url) url "${2:-planeacion}";;
  *) echo "uso: $0 start|stop|status|url [db]"; exit 2;;
esac
