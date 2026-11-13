-- ============================================================================
-- Planeación semanal · Preparación de PostgreSQL 16 (ejecutar UNA vez como superusuario o rol con CREATEROLE/CREATEDB)
--
--   psql -h <servidor> -U postgres \
--        -v owner_password='<clave-larga-propietario>' \
--        -v app_password='<clave-larga-aplicacion>' \
--        -f deploy/postgres/01-create-database.sql
--
-- Crea dos roles (mínimo privilegio):
--   planeacion_owner  dueño del esquema; solo se usa para migraciones (npm run db:migrate)
--   planeacion_app    el que usa la aplicación: solo lee y escribe datos (sin DDL)
-- Ajuste los nombres si su política lo requiere (y en los GRANT de abajo).
-- ============================================================================
\set ON_ERROR_STOP on

SET password_encryption = 'scram-sha-256';

CREATE ROLE planeacion_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE planeacion_app   LOGIN PASSWORD :'app_password'   NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 50;

CREATE DATABASE planeacion OWNER planeacion_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE planeacion FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE planeacion TO planeacion_owner;
GRANT CONNECT ON DATABASE planeacion TO planeacion_app;

\connect planeacion

-- Esquema propio en lugar de "public"
CREATE SCHEMA planeacion AUTHORIZATION planeacion_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA planeacion TO planeacion_app;
ALTER ROLE planeacion_owner IN DATABASE planeacion SET search_path = planeacion;
ALTER ROLE planeacion_app   IN DATABASE planeacion SET search_path = planeacion;

-- Privilegios de la aplicación sobre las tablas que creen las migraciones (actuales y futuras)
ALTER DEFAULT PRIVILEGES FOR ROLE planeacion_owner IN SCHEMA planeacion
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO planeacion_app;
ALTER DEFAULT PRIVILEGES FOR ROLE planeacion_owner IN SCHEMA planeacion
  GRANT USAGE, SELECT ON SEQUENCES TO planeacion_app;

-- Límites de seguridad para la aplicación
ALTER ROLE planeacion_app IN DATABASE planeacion SET statement_timeout = '15s';
ALTER ROLE planeacion_app IN DATABASE planeacion SET idle_in_transaction_session_timeout = '60s';

-- Siguiente paso: en pg_hba.conf permita solo conexiones cifradas desde el servidor de la aplicación, p. ej.:
--   hostssl  planeacion  planeacion_app,planeacion_owner  10.0.0.15/32  scram-sha-256
-- y recargue la configuración:  SELECT pg_reload_conf();
