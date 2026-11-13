import { DatabaseError } from './errors.ts';
import type { ColumnValue, SqlValue } from './pg/types.ts';
import { type Migration, migrationsFor } from './migrations.ts';

export type { SqlValue };
export type Row = Record<string, ColumnValue>;
export type Params = Record<string, SqlValue>;
export type Dialect = 'postgres' | 'sqlite';

/**
 * Contrato común de acceso a datos. Implementaciones:
 *  - PostgreSQL 16 (producción): src/server/db/postgres.ts — DATABASE_URL=postgres://…
 *  - SQLite (desarrollo local):   src/server/db/sqlite.ts   — DATABASE_URL=sqlite:./data/planeacion.db
 * Los repositorios escriben SQL común a ambos motores con parámetros con nombre ($nombre).
 */
export interface Database {
  readonly dialect: Dialect;
  all<T = Row>(sql: string, params?: Params): Promise<T[]>;
  get<T = Row>(sql: string, params?: Params): Promise<T | undefined>;
  run(sql: string, params?: Params): Promise<{ changes: number }>;
  /** SQL sin parámetros (admite varias sentencias). */
  exec(sql: string): Promise<void>;
  /** Ejecuta fn en una transacción; si ya hay una, usa un SAVEPOINT. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  inTransaction(): boolean;
  /** Exclusión mutua hasta el fin de la transacción actual (PostgreSQL: bloqueo consultivo; SQLite: ya serializa). */
  lockForTransaction(key: number): Promise<void>;
  /** Elimina todas las tablas de la aplicación (solo desarrollo/pruebas). */
  dropAllTables(): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  url: string;
  poolMax?: number;
  statementTimeoutMs?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  applicationName?: string;
}

/** Cita un identificador SQL (nombres de base de datos, esquemas), que no se pueden pasar como parámetro. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function dialectOf(url: string): Dialect {
  if (/^sqlite:/i.test(url)) return 'sqlite';
  if (/^postgres(ql)?:\/\//i.test(url)) return 'postgres';
  throw new Error('DATABASE_URL debe comenzar con postgres://, postgresql:// o sqlite:');
}

/** Ruta del archivo SQLite a partir de "sqlite:./data/planeacion.db" o "sqlite::memory:". */
export function sqlitePath(url: string): string {
  const p = url.replace(/^sqlite:(\/\/)?/i, '');
  if (!p) throw new Error('Indique la ruta del archivo SQLite: sqlite:./data/planeacion.db');
  return p;
}

/** Crea la conexión según el esquema de la URL (sin migrar). */
export async function createDatabase(opts: DatabaseOptions): Promise<Database> {
  if (dialectOf(opts.url) === 'sqlite') {
    const { SqliteDatabase } = await import('./sqlite.ts');
    return new SqliteDatabase(sqlitePath(opts.url));
  }
  const { PgDatabase } = await import('./postgres.ts');
  return new PgDatabase(opts);
}

/** Identificador del bloqueo consultivo que serializa las migraciones entre instancias. */
const MIGRATION_LOCK = 727_274_001;

const MIGRATIONS_TABLE: Record<Dialect, string> = {
  postgres: 'CREATE TABLE IF NOT EXISTS schema_migrations (id integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  sqlite: "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))",
};

export async function appliedMigrations(db: Database): Promise<number[]> {
  await db.exec(MIGRATIONS_TABLE[db.dialect]);
  return (await db.all<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id')).map((r) => r.id);
}

/** Migraciones pendientes, sin crear nada (apto para un rol sin permisos de DDL). */
export async function pendingMigrations(db: Database, migrations: readonly Migration[] = migrationsFor(db.dialect)): Promise<Migration[]> {
  let done: number[] = [];
  try {
    done = (await db.all<{ id: number }>('SELECT id FROM schema_migrations')).map((r) => r.id);
  } catch (e) {
    if (!(e instanceof DatabaseError && e.code === '42P01')) throw e; // la tabla aún no existe
  }
  return migrations.filter((m) => !done.includes(m.id));
}

/** Aplica las migraciones pendientes en orden, cada una en su transacción. */
export async function migrate(db: Database, migrations: readonly Migration[] = migrationsFor(db.dialect)): Promise<Migration[]> {
  return db.transaction(async () => {
    await db.lockForTransaction(MIGRATION_LOCK);
    const done = new Set(await appliedMigrations(db));
    const pending = migrations.filter((m) => !done.has(m.id)).sort((a, b) => a.id - b.id);
    for (const m of pending) {
      await db.transaction(async () => {
        await db.exec(m.sql);
        await db.run('INSERT INTO schema_migrations (id, name) VALUES ($id, $name)', { id: m.id, name: m.name });
      });
    }
    return pending;
  });
}

export async function dropAll(db: Database): Promise<void> {
  await db.dropAllTables();
}

/** Abre la conexión y aplica las migraciones pendientes. */
export async function openDatabase(opts: DatabaseOptions): Promise<Database> {
  const db = await createDatabase(opts);
  try {
    await migrate(db);
  } catch (e) {
    await db.close();
    throw e;
  }
  return db;
}
