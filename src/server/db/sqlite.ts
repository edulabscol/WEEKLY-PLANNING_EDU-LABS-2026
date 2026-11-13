// Adaptador SQLite (node:sqlite) para desarrollo local. Misma interfaz que PostgreSQL.
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { type Database, type Params, quoteIdent, type Row } from './database.ts';
import { DatabaseError } from './errors.ts';
import { toPositional } from './sql.ts';

const TABLES = ['audit_log', 'timers', 'time_entries', 'task_assignees', 'tasks', 'weeks', 'settings', 'sessions', 'users', 'schema_migrations'];

/** Traduce los errores de SQLite a códigos SQLSTATE, para que la API responda igual que con PostgreSQL. */
export function toDatabaseError(e: unknown): unknown {
  if (!(e instanceof Error) || e instanceof DatabaseError) return e;
  const msg = e.message;
  const rule: Array<[RegExp, string]> = [
    [/UNIQUE constraint failed|PRIMARY KEY/i, '23505'],
    [/FOREIGN KEY constraint failed/i, '23503'],
    [/CHECK constraint failed/i, '23514'],
    [/NOT NULL constraint failed/i, '23502'],
    [/no such table/i, '42P01'],
    [/database is locked|SQLITE_BUSY/i, '40001'],
  ];
  const hit = rule.find(([re]) => re.test(msg));
  if (!hit) return e;
  const constraint = /CHECK constraint failed: (\w+)/.exec(msg)?.[1];
  return new DatabaseError({ code: hit[1], message: msg, constraint });
}

interface TxState {
  depth: number;
}

export class SqliteDatabase implements Database {
  readonly dialect = 'sqlite' as const;
  readonly file: string;
  readonly raw: DatabaseSync;
  readonly #tx = new AsyncLocalStorage<TxState>();
  readonly #names = new Map<string, string[]>();
  /**
   * Una sola conexión: mientras una transacción está abierta (cruza varios await), ninguna otra consulta
   * puede ejecutarse sobre la conexión. #busy es la transacción activa, o null.
   */
  #busy: Promise<void> | null = null;

  async #acquire(): Promise<() => void> {
    while (this.#busy) await this.#busy;
    let release: () => void = () => undefined;
    this.#busy = new Promise<void>((resolve) => {
      release = () => {
        this.#busy = null;
        resolve();
      };
    });
    return release;
  }

  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (file !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL;');
    this.raw.exec('PRAGMA synchronous = NORMAL;');
  }

  #bind(sql: string, params: Params): Record<string, SQLInputValue> {
    let names = this.#names.get(sql);
    if (!names) {
      names = toPositional(sql).names;
      if (this.#names.size < 500) this.#names.set(sql, names);
    }
    const out: Record<string, SQLInputValue> = {};
    for (const n of names) {
      if (!(n in params)) throw new Error(`Falta el parámetro SQL $${n}`);
      const v = params[n];
      out[n] = typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
    }
    return out;
  }

  /** Espera a que no haya una transacción ajena en curso (fuera de transacción). */
  async #outside<T>(fn: () => T): Promise<T> {
    if (this.#tx.getStore()) return this.#wrap(fn);
    // Sin await entre la comprobación y la ejecución: node:sqlite es síncrono.
    while (this.#busy) await this.#busy;
    return this.#wrap(fn);
  }

  #wrap<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  all<T = Row>(sql: string, params: Params = {}): Promise<T[]> {
    return this.#outside(() => this.raw.prepare(sql).all(this.#bind(sql, params)) as T[]);
  }

  async get<T = Row>(sql: string, params: Params = {}): Promise<T | undefined> {
    return (await this.all<T>(sql, params))[0];
  }

  run(sql: string, params: Params = {}): Promise<{ changes: number }> {
    return this.#outside(() => ({ changes: Number(this.raw.prepare(sql).run(this.#bind(sql, params)).changes) }));
  }

  exec(sql: string): Promise<void> {
    return this.#outside(() => this.raw.exec(sql));
  }

  inTransaction(): boolean {
    return !!this.#tx.getStore();
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.#tx.getStore();
    if (current) {
      const sp = `sp_${current.depth + 1}`;
      this.raw.exec(`SAVEPOINT ${sp}`);
      try {
        const r = await this.#tx.run({ depth: current.depth + 1 }, fn);
        this.raw.exec(`RELEASE ${sp}`);
        return r;
      } catch (e) {
        this.raw.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw toDatabaseError(e);
      }
    }
    const release = await this.#acquire();
    try {
      this.raw.exec('BEGIN IMMEDIATE');
      try {
        const r = await this.#tx.run({ depth: 0 }, fn);
        this.raw.exec('COMMIT');
        return r;
      } catch (e) {
        if (this.raw.isTransaction) this.raw.exec('ROLLBACK');
        throw toDatabaseError(e);
      }
    } finally {
      release();
    }
  }

  /** En SQLite la transacción (BEGIN IMMEDIATE) ya es exclusiva. */
  async lockForTransaction(_key: number): Promise<void> {
    return undefined;
  }

  async dropAllTables(): Promise<void> {
    await this.#outside(() => {
      this.raw.exec('PRAGMA foreign_keys = OFF');
      for (const t of TABLES) this.raw.exec(`DROP TABLE IF EXISTS ${quoteIdent(t)}`);
      this.raw.exec('PRAGMA foreign_keys = ON');
    });
  }

  /** Copia consistente en caliente. */
  async backupTo(target: string): Promise<void> {
    await this.#outside(() => this.raw.prepare('VACUUM INTO ?').run(target));
  }

  async close(): Promise<void> {
    while (this.#busy) await this.#busy;
    if (this.raw.isOpen) this.raw.close();
  }
}
