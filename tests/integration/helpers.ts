import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, type App } from '../../src/server/app.ts';
import { type Config, loadConfig } from '../../src/server/config.ts';
import { connectAndMigrate } from '../../src/server/db/connect.ts';
import type { Database } from '../../src/server/db/database.ts';
import { PgDatabase } from '../../src/server/db/postgres.ts';
import { seedDemo } from '../../src/server/db/seed.ts';
import { createLogger } from '../../src/server/logger.ts';
import { type Clock, ServiceContext } from '../../src/server/services/context.ts';

export const ADMIN = { email: 'coordinacion@edulabs.test', password: 'Coordinacion2026' };
export const YERSON = { email: 'yerson@edulabs.test', password: 'Equipo2026' };
export const RUBEN = { email: 'ruben@edulabs.test', password: 'Equipo2026' };
export const WILSON = { email: 'wilson@edulabs.test', password: 'Equipo2026' };

export class FakeClock implements Clock {
  #t: number;
  constructor(iso = '2026-11-05T15:00:00.000Z') {
    this.#t = Date.parse(iso);
  }
  now(): Date {
    return new Date(this.#t);
  }
  advance(ms: number): void {
    this.#t += ms;
  }
}

export interface TestServer {
  url: string;
  app: App;
  db: Database;
  dbUrl: string;
  config: Config;
  clock: FakeClock;
  ctx: ServiceContext;
  close: () => Promise<void>;
}

/** Motor de las pruebas de integración: SQLite (por defecto, sin instalar nada) o PostgreSQL (TEST_DB=postgres). */
export const TEST_DB: 'sqlite' | 'postgres' = process.env.TEST_DB === 'postgres' ? 'postgres' : 'sqlite';

/** Servidor PostgreSQL de pruebas (con permiso CREATEDB). Por defecto, el clúster de scripts/pg-local.sh. */
export const TEST_ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://planeacion:planeacion_local@127.0.0.1:54329/postgres?sslmode=disable';

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Crea una base de datos vacía y aislada para una suite de pruebas. */
export async function createTestDatabase(): Promise<string> {
  if (TEST_DB === 'sqlite') return `sqlite:${path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'planeacion_test_')), 'test.db')}`;
  const name = `planeacion_test_${randomBytes(6).toString('hex')}`;
  const admin = new PgDatabase({ url: TEST_ADMIN_URL, poolMax: 1 });
  try {
    await admin.exec(`CREATE DATABASE ${name}`);
  } finally {
    await admin.close();
  }
  return withDatabase(TEST_ADMIN_URL, name);
}

export async function dropTestDatabase(url: string): Promise<void> {
  if (url.startsWith('sqlite:')) {
    const dir = path.dirname(url.slice('sqlite:'.length));
    if (!path.basename(dir).startsWith('planeacion_test_')) throw new Error(`Ruta de pruebas inesperada: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }
  const name = new URL(url).pathname.slice(1);
  if (!/^planeacion_test_[0-9a-f]+$/.test(name)) throw new Error(`Nombre de base de pruebas inesperado: ${name}`);
  const admin = new PgDatabase({ url: TEST_ADMIN_URL, poolMax: 1 });
  try {
    await admin.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await admin.close();
  }
}

/**
 * Levanta la app sobre una base de datos PostgreSQL aislada, con datos semilla y fecha fija (2026-11-05).
 * Si no se indica dbUrl, la base se crea y se elimina al cerrar.
 */
export async function startServer(opts: { dbUrl?: string; keepDatabase?: boolean; seed?: boolean; env?: Record<string, string>; clock?: FakeClock } = {}): Promise<TestServer> {
  const dbUrl = opts.dbUrl ?? (await createTestDatabase());
  const ownsDb = !opts.dbUrl && !opts.keepDatabase;
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planeacion-public-'));
  const config = loadConfig({ NODE_ENV: 'test', APP_TODAY: '2026-11-05', DATABASE_URL: dbUrl, LOGIN_RATE_LIMIT: '1000', PUBLIC_DIR: publicDir, ...opts.env });
  const clock = opts.clock ?? new FakeClock();
  const db = await connectAndMigrate(config, 'planeacion-test');
  const ctx = new ServiceContext(db, config, createLogger('silent'), clock);
  if (opts.seed !== false && (await ctx.users.count()) === 0) {
    await seedDemo(ctx, { adminPassword: ADMIN.password, memberPassword: YERSON.password });
  }
  const app = createApp(db, config, createLogger('silent'), clock);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    app,
    db,
    dbUrl,
    config,
    clock,
    ctx,
    close: async () => {
      await app.close();
      await db.close();
      if (ownsDb) await dropTestDatabase(dbUrl);
    },
  };
}

export interface Res<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

/** Cliente HTTP con cookie de sesión y token CSRF, como el navegador. */
export class Client {
  readonly base: string;
  cookie = '';
  csrf = '';
  origin: string | null = null;

  constructor(base: string) {
    this.base = base;
  }

  async req<T = unknown>(method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { ...extra };
    if (body !== undefined && !('Content-Type' in headers)) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.csrf && method !== 'GET' && !('X-CSRF-Token' in headers)) headers['X-CSRF-Token'] = this.csrf;
    if (this.origin) headers.Origin = this.origin;
    const res = await fetch(this.base + url, { method, headers, body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = /ps_session=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `ps_session=${m[1]}` : '';
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get<T = unknown>(url: string): Promise<Res<T>> {
    return this.req<T>('GET', url);
  }
  post<T = unknown>(url: string, body?: unknown): Promise<Res<T>> {
    return this.req<T>('POST', url, body);
  }
  patch<T = unknown>(url: string, body?: unknown): Promise<Res<T>> {
    return this.req<T>('PATCH', url, body);
  }
  put<T = unknown>(url: string, body?: unknown): Promise<Res<T>> {
    return this.req<T>('PUT', url, body);
  }
  del<T = unknown>(url: string): Promise<Res<T>> {
    return this.req<T>('DELETE', url);
  }

  async login(creds: { email: string; password: string }): Promise<Res<{ user: { id: string }; csrfToken: string }>> {
    const r = await this.post<{ user: { id: string }; csrfToken: string }>('/api/auth/login', creds);
    if (r.status === 200) this.csrf = r.body.csrfToken;
    return r;
  }
}

export async function loggedIn(url: string, creds: { email: string; password: string }): Promise<Client> {
  const c = new Client(url);
  const r = await c.login(creds);
  if (r.status !== 200) throw new Error(`login falló: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}
