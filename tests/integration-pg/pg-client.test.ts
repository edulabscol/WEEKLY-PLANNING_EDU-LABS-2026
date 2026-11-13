import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PgConnection, PgConnectionError, type PgConnectOptions } from '../../src/server/db/pg/connection.ts';
import { parseDatabaseUrl, PgPool } from '../../src/server/db/pg/pool.ts';
import { TEST_ADMIN_URL } from '../integration/helpers.ts';

const base = parseDatabaseUrl(TEST_ADMIN_URL);
const opts = (over: Partial<PgConnectOptions> = {}): PgConnectOptions => ({
  ...base,
  sslMode: 'disable',
  connectTimeoutMs: 3000,
  statementTimeoutMs: 5000,
  applicationName: 'planeacion-test',
  ...over,
});
const CA = path.resolve(process.env.PGLOCAL_DIR ?? '.pgdata', 'server.crt');

describe('cliente PostgreSQL nativo contra un servidor real', () => {
  it('se conecta con SCRAM-SHA-256, con y sin SSL', async () => {
    for (const [mode, ssl] of [
      ['disable', false],
      ['require', true],
      ['prefer', true],
    ] as const) {
      const c = await PgConnection.connect(opts({ sslMode: mode }));
      const r = await c.query("SELECT (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl, current_setting('TimeZone') AS tz, current_setting('server_version_num')::int AS v");
      assert.equal(r.rows[0]?.ssl, ssl, mode);
      assert.equal(r.rows[0]?.tz, 'UTC');
      assert.ok(Number(r.rows[0]?.v) >= 160000, 'PostgreSQL 16+');
      await c.close();
      assert.equal(c.alive, false);
    }
  });

  it('verify-full valida el certificado y el nombre del servidor', async () => {
    assert.ok(fs.existsSync(CA), `Se requiere el certificado del servidor de pruebas en ${CA} (scripts/pg-local.sh start)`);
    const ok = await PgConnection.connect(opts({ host: 'localhost', sslMode: 'verify-full', sslRootCert: CA }));
    assert.equal((await ok.query('SELECT 1 AS uno')).rows[0]?.uno, 1);
    await ok.close();
    await assert.rejects(PgConnection.connect(opts({ host: 'localhost', sslMode: 'verify-full' })), /SSL/, 'sin la CA el certificado autofirmado no es de confianza');
    await assert.rejects(PgConnection.connect(opts({ host: '127.0.0.1', sslMode: 'verify-full', sslRootCert: CA })), /SSL/, 'el nombre no coincide con el certificado');
  });

  it('informa credenciales inválidas, base inexistente y servidor inalcanzable', async () => {
    await assert.rejects(PgConnection.connect(opts({ password: 'incorrecta' })), (e: Error & { code?: string }) => e.code === '28P01');
    await assert.rejects(PgConnection.connect(opts({ database: 'no_existe_db' })), (e: Error & { code?: string }) => e.code === '3D000');
    await assert.rejects(PgConnection.connect(opts({ port: 1 })), PgConnectionError);
  });

  it('ejecuta consultas encoladas, varias sentencias y se recupera de errores', async () => {
    const c = await PgConnection.connect(opts());
    try {
      const [a, b] = await Promise.all([c.query('SELECT $1::int AS n', ['1']), c.query('SELECT $1::text AS t', ['dos'])]);
      assert.equal(a.rows[0]?.n, 1);
      assert.equal(b.rows[0]?.t, 'dos');
      const multi = await c.simple('CREATE TEMP TABLE t (x int); INSERT INTO t VALUES (1), (2); UPDATE t SET x = x + 1');
      assert.equal(multi.command, 'UPDATE');
      await assert.rejects(c.query('SELECT 1/0'), (e: Error & { code?: string }) => e.code === '22012');
      assert.equal((await c.query('SELECT count(*) AS n FROM t')).rows[0]?.n, 2);
    } finally {
      await c.close();
    }
  });

  it('aplica el tiempo máximo por sentencia (statement_timeout)', async () => {
    const c = await PgConnection.connect(opts({ statementTimeoutMs: 200 }));
    try {
      await assert.rejects(c.query('SELECT pg_sleep(2)'), (e: Error & { code?: string }) => e.code === '57014');
      assert.equal((await c.query('SELECT 1 AS ok')).rows[0]?.ok, 1);
    } finally {
      await c.close();
    }
  });

  it('detecta una conexión cortada por el servidor', async () => {
    const victim = await PgConnection.connect(opts());
    const pid = (await victim.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
    const killer = await PgConnection.connect(opts());
    await killer.query('SELECT pg_terminate_backend($1::int)', [String(pid)]);
    await killer.close();
    await assert.rejects(victim.query('SELECT 1'), PgConnectionError);
    assert.equal(victim.alive, false);
    await assert.rejects(victim.query('SELECT 1'), /cerrada/);
  });
});

describe('pool de conexiones', () => {
  let pool: PgPool;
  before(() => {
    pool = new PgPool({ ...opts(), max: 2, idleTimeoutMs: 60_000 });
  });
  after(async () => pool.end());

  it('respeta el máximo y atiende a quien espera al liberar', async () => {
    const a = await pool.acquire();
    const b = await pool.acquire();
    assert.deepEqual(pool.stats, { total: 2, idle: 0, waiting: 0 });
    let got = false;
    const waiting = pool.acquire().then((c) => {
      got = true;
      return c;
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(got, false);
    assert.equal(pool.stats.waiting, 1);
    pool.release(a);
    const c = await waiting;
    assert.equal(c, a, 'reutiliza la conexión liberada');
    pool.release(b);
    pool.release(c);
    assert.equal(pool.stats.idle, 2);
  });

  it('revierte una transacción abierta al devolver la conexión', async () => {
    const c = await pool.acquire();
    await c.simple('BEGIN; CREATE TEMP TABLE tx_test (x int)');
    assert.equal(c.txStatus, 'T');
    pool.release(c);
    await new Promise((r) => setTimeout(r, 50));
    const again = await pool.acquire();
    assert.equal(again.txStatus, 'I');
    pool.release(again);
  });

  it('reemplaza conexiones muertas y agota la espera con un error claro', async () => {
    const small = new PgPool({ ...opts({ connectTimeoutMs: 300 }), max: 1, idleTimeoutMs: 60_000 });
    try {
      const c = await small.acquire();
      await assert.rejects(small.acquire(), /No hay conexiones disponibles/);
      await c.close();
      small.release(c);
      const fresh = await small.acquire();
      assert.notEqual(fresh, c);
      assert.equal((await fresh.query('SELECT 1 AS ok')).rows[0]?.ok, 1);
      small.release(fresh);
    } finally {
      await small.end();
    }
    await assert.rejects(small.acquire(), /cerrado/);
  });
});
