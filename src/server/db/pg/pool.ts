import { type PgConnectOptions, PgConnection, PgConnectionError, type SslMode } from './connection.ts';

export interface PoolOptions extends PgConnectOptions {
  max: number;
  idleTimeoutMs: number;
}

/** Interpreta una URL postgres://usuario:clave@host:puerto/base?sslmode=require&sslrootcert=/ruta/ca.pem */
export function parseDatabaseUrl(url: string): Omit<PgConnectOptions, 'connectTimeoutMs' | 'statementTimeoutMs' | 'applicationName'> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('DATABASE_URL no es una URL válida (formato: postgres://usuario:clave@host:5432/base).');
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('DATABASE_URL debe comenzar con postgres:// o postgresql://');
  const sslMode = (u.searchParams.get('sslmode') ?? 'prefer') as SslMode;
  if (!['disable', 'prefer', 'require', 'verify-full'].includes(sslMode)) throw new Error('sslmode admite: disable, prefer, require, verify-full.');
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL debe indicar el nombre de la base de datos.');
  const sslRootCert = u.searchParams.get('sslrootcert');
  return {
    host: u.hostname.replace(/^\[|\]$/g, '') || '127.0.0.1',
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    sslMode,
    ...(sslRootCert ? { sslRootCert } : {}),
  };
}

/** Pool de conexiones con límite, cola de espera y cierre de conexiones inactivas. */
export class PgPool {
  readonly #opts: PoolOptions;
  readonly #idle: PgConnection[] = [];
  readonly #waiters: Array<{ resolve: (c: PgConnection) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];
  #total = 0;
  #ended = false;
  readonly #sweeper: NodeJS.Timeout;

  constructor(opts: PoolOptions) {
    this.#opts = opts;
    this.#sweeper = setInterval(() => this.#sweep(), Math.max(1000, Math.min(opts.idleTimeoutMs, 30_000)));
    this.#sweeper.unref();
  }

  get stats(): { total: number; idle: number; waiting: number } {
    return { total: this.#total, idle: this.#idle.length, waiting: this.#waiters.length };
  }

  async acquire(): Promise<PgConnection> {
    if (this.#ended) throw new PgConnectionError('El pool de conexiones está cerrado.');
    while (this.#idle.length) {
      const c = this.#idle.pop();
      if (c?.alive) return c;
      this.#total--;
    }
    if (this.#total < this.#opts.max) {
      this.#total++;
      try {
        return await PgConnection.connect(this.#opts);
      } catch (e) {
        this.#total--;
        throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.#waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this.#waiters.splice(i, 1);
        reject(new PgConnectionError('No hay conexiones disponibles con la base de datos (tiempo de espera agotado).'));
      }, this.#opts.connectTimeoutMs);
      this.#waiters.push({ resolve, reject, timer });
    });
  }

  release(conn: PgConnection): void {
    if (!conn.alive || this.#ended) {
      this.#total--;
      if (conn.alive) void conn.close();
      this.#serveWaiterWithNew();
      return;
    }
    if (conn.txStatus !== 'I') {
      // Una transacción quedó abierta por un error: se revierte antes de reutilizar la conexión.
      conn
        .simple('ROLLBACK')
        .catch(() => undefined)
        .finally(() => this.release(conn));
      return;
    }
    conn.lastUsed = Date.now();
    const waiter = this.#waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(conn);
      return;
    }
    this.#idle.push(conn);
  }

  #serveWaiterWithNew(): void {
    const waiter = this.#waiters.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.acquire().then(waiter.resolve, waiter.reject);
  }

  #sweep(): void {
    const now = Date.now();
    for (let i = this.#idle.length - 1; i >= 0; i--) {
      const c = this.#idle[i];
      if (c && now - c.lastUsed > this.#opts.idleTimeoutMs) {
        this.#idle.splice(i, 1);
        this.#total--;
        void c.close();
      }
    }
  }

  async end(): Promise<void> {
    this.#ended = true;
    clearInterval(this.#sweeper);
    for (const w of this.#waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(new PgConnectionError('El pool de conexiones se cerró.'));
    }
    const idle = this.#idle.splice(0);
    this.#total -= idle.length;
    await Promise.all(idle.map((c) => c.close()));
  }
}
