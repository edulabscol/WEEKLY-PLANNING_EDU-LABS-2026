import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, insecureRemoteDb, loadConfig, today } from '../../src/server/config.ts';
import { HttpError, badRequest, conflict, forbidden, notFound, tooManyRequests, unauthorized, unprocessable, validationError } from '../../src/server/http/errors.ts';
import { RateLimiter } from '../../src/server/http/rate-limit.ts';
import { Router } from '../../src/server/http/router.ts';
import { parseCookies, serializeCookie } from '../../src/server/http/util.ts';
import { createLogger, redact } from '../../src/server/logger.ts';
import { hashPassword, verifyPassword } from '../../src/server/services/passwords.ts';
import { hashToken } from '../../src/server/services/auth.ts';

describe('contraseñas', () => {
  it('genera hashes scrypt con sal distinta y los verifica', async () => {
    const a = await hashPassword('Equipo2026');
    const b = await hashPassword('Equipo2026');
    assert.match(a, /^scrypt\$16384\$8\$1\$/);
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('Equipo2026', a), true);
    assert.equal(await verifyPassword('equipo2026', a), false);
    assert.equal(await verifyPassword('Equipo2026', 'md5$abc'), false);
  });
  it('los tokens de sesión se guardan como hash SHA-256', () => {
    assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
    assert.notEqual(hashToken('abc'), hashToken('abd'));
  });
});

describe('limitador de solicitudes', () => {
  it('bloquea al superar el máximo y reinicia al pasar la ventana', () => {
    let now = 0;
    const rl = new RateLimiter({ max: 2, windowMs: 1000, now: () => now });
    assert.equal(rl.hit('ip').allowed, true);
    assert.equal(rl.hit('ip').allowed, true);
    const third = rl.hit('ip');
    assert.equal(third.allowed, false);
    assert.equal(third.retryAfterSeconds, 1);
    assert.equal(rl.hit('otra').allowed, true);
    now = 1001;
    rl.prune();
    assert.equal(rl.hit('ip').allowed, true);
    rl.reset('ip');
    assert.equal(rl.hit('ip').allowed, true);
    rl.stop();
  });
});

describe('logs', () => {
  it('oculta datos sensibles y respeta el nivel', () => {
    assert.deepEqual(redact({ password: 'x', csrfToken: 'y', userId: 'u' }), { password: '[oculto]', csrfToken: '[oculto]', userId: 'u' });
    const err = redact({ err: new Error('boom') }).err as { message: string };
    assert.equal(err.message, 'boom');
    const lines: string[] = [];
    const log = createLogger('warn', (l) => lines.push(l));
    log.debug('d');
    log.info('i');
    log.warn('w', { token: 't' });
    log.error('e');
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0] ?? '{}').token, '[oculto]');
    createLogger('silent', (l) => lines.push(l)).error('nada');
    assert.equal(lines.length, 2);
  });
});

describe('configuración', () => {
  it('usa valores por defecto seguros', () => {
    const DB = 'postgres://u:p@127.0.0.1:5432/app';
    const c = loadConfig({ NODE_ENV: 'production', DATABASE_URL: DB });
    assert.equal(c.cookieSecure, true);
    assert.equal(c.host, '0.0.0.0');
    assert.equal(c.fixedToday, null);
    assert.equal(c.sessionTtlHours, 12);
    const d = loadConfig({ DATABASE_URL: DB });
    assert.equal(d.env, 'development');
    assert.equal(d.cookieSecure, false);
    assert.equal(d.host, '127.0.0.1');
  });
  it('ignora APP_TODAY en producción y lo usa fuera de ella', () => {
    const DB = 'postgres://u:p@127.0.0.1:5432/app';
    assert.equal(loadConfig({ NODE_ENV: 'production', APP_TODAY: '2026-11-05', DATABASE_URL: DB }).fixedToday, null);
    const c = loadConfig({ DATABASE_URL: DB, NODE_ENV: 'test', APP_TODAY: '2026-11-05', CORS_ORIGINS: 'https://a.co, https://b.co', COOKIE_SECURE: 'true' });
    assert.equal(today(c), '2026-11-05');
    assert.deepEqual(c.corsOrigins, ['https://a.co', 'https://b.co']);
    assert.equal(c.cookieSecure, true);
    assert.equal(c.logLevel, 'silent');
  });
  it('rechaza valores inválidos', () => {
    const DB = 'postgres://u:p@127.0.0.1:5432/app';
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL/, 'obligatoria en producción');
    assert.equal(loadConfig({}).database.url, 'sqlite:./data/planeacion.db', 'SQLite por defecto en desarrollo');
    assert.throws(() => loadConfig({ DATABASE_URL: 'mysql://x' }), /postgres:\/\//);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, NODE_ENV: 'staging' }), ConfigError);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, PORT: 'abc' }), /PORT/);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, PORT: '70000' }), /PORT/);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, DB_POOL_MAX: '0' }), /DB_POOL_MAX/);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, APP_TIMEZONE: 'Marte/Base' }), /APP_TIMEZONE/);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, APP_TODAY: '2026-02-30' }), /APP_TODAY/);
    assert.throws(() => loadConfig({ DATABASE_URL: DB, LOG_LEVEL: 'verbose' }), /LOG_LEVEL/);
  });

  it('detecta conexiones remotas a PostgreSQL sin cifrado obligatorio', () => {
    assert.equal(insecureRemoteDb('postgres://u:p@db.empresa.co/app'), true);
    assert.equal(insecureRemoteDb('postgres://u:p@db.empresa.co/app?sslmode=disable'), true);
    assert.equal(insecureRemoteDb('postgres://u:p@db.empresa.co/app?sslmode=require'), false);
    assert.equal(insecureRemoteDb('postgres://u:p@db.empresa.co/app?sslmode=verify-full'), false);
    assert.equal(insecureRemoteDb('postgres://u:p@localhost/app'), false);
    assert.equal(insecureRemoteDb('no es url'), false);
  });
});

describe('utilidades HTTP', () => {
  it('lee y escribe cookies', () => {
    assert.deepEqual(parseCookies('a=1; ps_session=x%20y; vacio; =z'), { a: '1', ps_session: 'x y' });
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies('bad=%E0%A4%A'), { bad: '%E0%A4%A' });
    const c = serializeCookie('ps_session', 'tok', { maxAgeSeconds: 60, secure: true });
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Lax/);
    assert.match(c, /Secure/);
    assert.match(c, /Max-Age=60/);
    assert.doesNotMatch(serializeCookie('a', 'b', { maxAgeSeconds: 0, secure: false }), /Secure/);
  });

  it('enruta con parámetros y reporta métodos permitidos', () => {
    const r = new Router();
    const h = () => ({});
    r.add('GET', '/api/tasks/:id', h).add('PATCH', '/api/tasks/:id', h);
    const m = r.match('GET', '/api/tasks/abc%2D1');
    assert.ok(m && 'route' in m);
    if (m && 'route' in m) assert.deepEqual(m.params, { id: 'abc-1' });
    assert.deepEqual(r.match('POST', '/api/tasks/1'), { allowed: ['GET', 'PATCH'] });
    assert.equal(r.match('GET', '/api/otra'), null);
    assert.ok(r.match('GET', '/api/tasks/1/'));
  });

  it('construye errores HTTP con código y estado', () => {
    const cases: Array<[HttpError, number, string]> = [
      [badRequest('x'), 400, 'bad_request'],
      [validationError({ a: 'b' }), 422, 'validation_error'],
      [unauthorized(), 401, 'unauthorized'],
      [forbidden(), 403, 'forbidden'],
      [notFound(), 404, 'not_found'],
      [conflict('x'), 409, 'conflict'],
      [unprocessable('x'), 422, 'business_rule'],
      [tooManyRequests(), 429, 'rate_limited'],
    ];
    for (const [e, status, code] of cases) {
      assert.equal(e.status, status);
      assert.equal(e.code, code);
    }
    assert.deepEqual(validationError({ a: 'b' }).fields, { a: 'b' });
  });
});
