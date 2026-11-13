-- Planeación semanal · Esquema PostgreSQL 16 (GENERADO a partir de src/server/db/migrations.ts; no editar a mano).
-- La aplicación aplica estas migraciones con "npm run db:migrate" y las registra en la tabla schema_migrations.

-- ---------------------------------------------------------------- migración 1: esquema_inicial
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  email         varchar(160) NOT NULL,
  name          varchar(80)  NOT NULL,
  color         char(7)      NOT NULL,
  role          varchar(10)  NOT NULL,
  job_title     varchar(60)  NOT NULL DEFAULT '',
  in_team       boolean      NOT NULL DEFAULT true,
  active        boolean      NOT NULL DEFAULT true,
  password_hash text         NOT NULL,
  failed_logins integer      NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_uq        UNIQUE (email),
  CONSTRAINT users_email_lower_chk CHECK (email = lower(email) AND position('@' IN email) > 1),
  CONSTRAINT users_name_chk        CHECK (char_length(btrim(name)) >= 1),
  CONSTRAINT users_color_chk       CHECK (color ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT users_role_chk        CHECK (role IN ('admin', 'member')),
  CONSTRAINT users_failed_chk      CHECK (failed_logins >= 0)
);
COMMENT ON TABLE users IS 'Personas con acceso. Se desactivan (active=false), no se borran, para conservar el historial.';

CREATE TABLE sessions (
  id           char(64)    PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token   varchar(64) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip           varchar(64),
  user_agent   varchar(300)
);
COMMENT ON COLUMN sessions.id IS 'SHA-256 (hex) del token de la cookie; el token en claro nunca se guarda.';
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

CREATE TABLE settings (
  key        varchar(60) PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE weeks (
  id         varchar(8)  PRIMARY KEY,
  iso_year   smallint    NOT NULL,
  iso_week   smallint    NOT NULL,
  monday     date        NOT NULL,
  created_by uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weeks_id_chk     CHECK (id ~ '^[0-9]{4}-W[0-9]{2}$'),
  CONSTRAINT weeks_week_chk   CHECK (iso_week BETWEEN 1 AND 53),
  CONSTRAINT weeks_monday_uq  UNIQUE (monday),
  CONSTRAINT weeks_monday_chk CHECK (extract(isodow FROM monday) = 1)
);
COMMENT ON TABLE weeks IS 'Tablero semanal (semana ISO-8601).';

CREATE TABLE tasks (
  id                uuid         PRIMARY KEY,
  seq               bigint       GENERATED ALWAYS AS IDENTITY UNIQUE,
  week_id           varchar(8)   NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  type              varchar(5)   NOT NULL,
  name              varchar(200) NOT NULL,
  description       text         NOT NULL DEFAULT '',
  project           varchar(120) NOT NULL DEFAULT '',
  requested_by      varchar(120) NOT NULL DEFAULT '',
  status            varchar(10)  NOT NULL,
  priority          varchar(5)   NOT NULL,
  progress          smallint     NOT NULL,
  due_date          date,
  carried_from_week varchar(8)   REFERENCES weeks(id) ON DELETE SET NULL,
  carried_from_task uuid         REFERENCES tasks(id) ON DELETE SET NULL,
  moved_to_week     varchar(8)   REFERENCES weeks(id) ON DELETE SET NULL,
  delay_by_task_id  uuid         REFERENCES tasks(id) ON DELETE SET NULL,
  delay_reason      varchar(1000) NOT NULL DEFAULT '',
  created_by        uuid         REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT tasks_type_chk          CHECK (type IN ('plan', 'extra')),
  CONSTRAINT tasks_name_chk          CHECK (char_length(btrim(name)) >= 1),
  CONSTRAINT tasks_description_chk   CHECK (char_length(description) <= 5000),
  CONSTRAINT tasks_status_chk        CHECK (status IN ('todo', 'doing', 'review', 'blocked', 'done')),
  CONSTRAINT tasks_priority_chk      CHECK (priority IN ('alta', 'media', 'baja')),
  CONSTRAINT tasks_progress_chk      CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT tasks_done_progress_chk CHECK ((status = 'done') = (progress = 100)),
  CONSTRAINT tasks_delay_self_chk    CHECK (delay_by_task_id IS DISTINCT FROM id)
);
COMMENT ON COLUMN tasks.deleted_at IS 'Borrado lógico: permite "Deshacer" y conserva la auditoría.';
CREATE INDEX tasks_week_active_idx ON tasks(week_id, created_at, seq) WHERE deleted_at IS NULL;
CREATE INDEX tasks_delay_by_idx ON tasks(delay_by_task_id) WHERE delay_by_task_id IS NOT NULL;

CREATE TABLE task_assignees (
  task_id          uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  estimate_minutes integer     NOT NULL,
  seq              bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id),
  CONSTRAINT task_assignees_estimate_chk CHECK (estimate_minutes BETWEEN 0 AND 12000)
);
CREATE INDEX task_assignees_user_idx ON task_assignees(user_id);

CREATE TABLE time_entries (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id    uuid        NOT NULL,
  user_id    uuid        NOT NULL,
  seconds    integer     NOT NULL,
  source     varchar(10) NOT NULL,
  created_by uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_source_chk CHECK (source IN ('timer', 'quick', 'manual', 'adjust', 'seed')),
  CONSTRAINT time_entries_assignee_fk FOREIGN KEY (task_id, user_id) REFERENCES task_assignees(task_id, user_id) ON DELETE CASCADE
);
COMMENT ON TABLE time_entries IS 'Libro de tiempo: el real de cada persona es la suma de sus registros. Los ajustes manuales pueden ser negativos.';
CREATE INDEX time_entries_assignee_idx ON time_entries(task_id, user_id);

CREATE TABLE timers (
  owner_id   uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  task_id    uuid        NOT NULL,
  user_id    uuid        NOT NULL,
  started_at timestamptz NOT NULL,
  CONSTRAINT timers_assignee_uq UNIQUE (task_id, user_id),
  CONSTRAINT timers_assignee_fk FOREIGN KEY (task_id, user_id) REFERENCES task_assignees(task_id, user_id) ON DELETE CASCADE
);
COMMENT ON TABLE timers IS 'Cronómetro activo: uno por usuario que lo inicia y uno por asignación.';

CREATE TABLE audit_log (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  action     varchar(60) NOT NULL,
  entity     varchar(30) NOT NULL,
  entity_id  varchar(64),
  details    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip         varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);
