import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database, DatabaseOptions, Params, Row } from './database.ts';
import { type PgConnection } from './pg/connection.ts';
import { parseDatabaseUrl, PgPool } from './pg/pool.ts';
import { serializeValue } from './pg/types.ts';
import { toPositional } from './sql.ts';

interface TxState {
  conn: PgConnection;
  depth: number;
}

/**
 * Acceso a PostgreSQL con parámetros con nombre ($nombre) y transacciones anidables.
 * Dentro de transaction(), todas las consultas (incluidas las de repositorios) usan la misma conexión.
 */
export class PgDatabase implements Database {
  readonly dialect = 'postgres' as const;
  readonly pool: PgPool;
  readonly #tx = new AsyncLocalStorage<TxState>();
  readonly #cache = new Map<string, { text: string; names: string[] }>();

  constructor(opts: DatabaseOptions) {
    this.pool = new PgPool({
      ...parseDatabaseUrl(opts.url),
      max: opts.poolMax ?? 10,
      statementTimeoutMs: opts.statementTimeoutMs ?? 15_000,
      connectTimeoutMs: opts.connectTimeoutMs ?? 10_000,
      idleTimeoutMs: opts.idleTimeoutMs ?? 30_000,
      applicationName: opts.applicationName ?? 'planeacion-semanal',
    });
  }

  #prepare(sql: string, params: Params): { text: string; values: Array<string | null> } {
    let p = this.#cache.get(sql);
    if (!p) {
      p = toPositional(sql);
      if (this.#cache.size < 500) this.#cache.set(sql, p);
    }
    const values = p.names.map((n) => {
      if (!(n in params)) throw new Error(`Falta el parámetro SQL $${n}`);
      return serializeValue(params[n]);
    });
    return { text: p.text, values };
  }

  async #withConn<T>(fn: (c: PgConnection) => Promise<T>): Promise<T> {
    const tx = this.#tx.getStore();
    if (tx) return fn(tx.conn);
    const conn = await this.pool.acquire();
    try {
      return await fn(conn);
    } finally {
      this.pool.release(conn);
    }
  }

  async all<T = Row>(sql: string, params: Params = {}): Promise<T[]> {
    const { text, values } = this.#prepare(sql, params);
    return this.#withConn(async (c) => (await c.query(text, values)).rows as T[]);
  }

  async get<T = Row>(sql: string, params: Params = {}): Promise<T | undefined> {
    return (await this.all<T>(sql, params))[0];
  }

  async run(sql: string, params: Params = {}): Promise<{ changes: number }> {
    const { text, values } = this.#prepare(sql, params);
    return this.#withConn(async (c) => ({ changes: (await c.query(text, values)).rowCount }));
  }

  /** Ejecuta SQL sin parámetros (admite varias sentencias). */
  async exec(sql: string): Promise<void> {
    await this.#withConn((c) => c.simple(sql));
  }

  inTransaction(): boolean {
    return !!this.#tx.getStore();
  }

  /** Ejecuta fn en una transacción; si ya hay una, usa un SAVEPOINT. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.#tx.getStore();
    if (current) {
      const sp = `sp_${current.depth + 1}`;
      await current.conn.simple(`SAVEPOINT ${sp}`);
      try {
        const r = await this.#tx.run({ conn: current.conn, depth: current.depth + 1 }, fn);
        await current.conn.simple(`RELEASE SAVEPOINT ${sp}`);
        return r;
      } catch (e) {
        await current.conn.simple(`ROLLBACK TO SAVEPOINT ${sp}; RELEASE SAVEPOINT ${sp}`).catch(() => undefined);
        throw e;
      }
    }
    const conn = await this.pool.acquire();
    try {
      await conn.simple('BEGIN');
      const r = await this.#tx.run({ conn, depth: 0 }, fn);
      await conn.simple('COMMIT');
      return r;
    } catch (e) {
      await conn.simple('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      this.pool.release(conn);
    }
  }

  /** Bloqueo consultivo hasta el fin de la transacción: serializa operaciones entre instancias. */
  async lockForTransaction(key: number): Promise<void> {
    await this.get('SELECT pg_advisory_xact_lock($key) AS ok', { key });
  }

  async dropAllTables(): Promise<void> {
    await this.exec('DROP TABLE IF EXISTS audit_log, timers, time_entries, task_assignees, tasks, weeks, settings, sessions, users, schema_migrations CASCADE');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

