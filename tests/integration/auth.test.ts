import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BootstrapDTO } from '../../src/shared/types.ts';
import { ADMIN, Client, loggedIn, RUBEN, startServer, type TestServer, WILSON, YERSON } from './helpers.ts';

describe('autenticación y sesiones', () => {
  let s: TestServer;
  before(async () => {
    s = await startServer({ env: { LOGIN_RATE_LIMIT: '8' } });
  });
  after(async () => s.close());

  it('el endpoint de salud es público', async () => {
    const r = await new Client(s.url).get<{ status: string; db: string }>('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.db, 'ok');
  });

  it('las rutas protegidas exigen sesión', async () => {
    const c = new Client(s.url);
    assert.equal((await c.get('/api/bootstrap')).status, 401);
    assert.equal((await c.get('/api/weeks/2026-W45')).status, 401);
    assert.deepEqual((await c.get('/api/auth/session')).body, { authenticated: false });
  });

  it('rechaza credenciales inválidas con un mensaje genérico', async () => {
    const c = new Client(s.url);
    const bad = await c.login({ email: YERSON.email, password: 'Incorrecta123' });
    const unknown = await c.login({ email: 'nadie@edulabs.test', password: 'Incorrecta123' });
    assert.equal(bad.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(bad.body, unknown.body);
    const invalid = await c.login({ email: 'no-es-correo', password: '' });
    assert.equal(invalid.status, 422);
  });

  it('inicia sesión con cookie HttpOnly y entrega el estado inicial', async () => {
    const c = new Client(s.url);
    const r = await c.login(YERSON);
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie') ?? '';
    assert.match(cookie, /ps_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.ok(r.body.csrfToken.length > 20);
    assert.equal((r.body.user as unknown as Record<string, unknown>).passwordHash, undefined, 'no expone el hash');
    const b = await c.get<BootstrapDTO>('/api/bootstrap');
    assert.equal(b.status, 200);
    assert.equal(b.body.today, '2026-11-05');
    assert.equal(b.body.currentWeekId, '2026-W45');
    assert.deepEqual(b.body.weeks, ['2026-W44', '2026-W45']);
    assert.deepEqual(
      b.body.team.map((u) => u.firstName),
      ['Yerson', 'Rubén', 'Wilson'],
    );
    assert.equal(b.body.settings.capacityHours, 40);
    assert.equal(b.body.timer, null);
  });

  it('exige el token CSRF en operaciones que modifican datos', async () => {
    const c = await loggedIn(s.url, YERSON);
    const noToken = await c.req('POST', '/api/timer/stop', undefined, { 'X-CSRF-Token': '' });
    assert.equal(noToken.status, 403);
    const wrong = await c.req('POST', '/api/timer/stop', undefined, { 'X-CSRF-Token': 'otro' });
    assert.equal(wrong.status, 403);
  });

  it('rechaza peticiones de otro origen', async () => {
    const c = await loggedIn(s.url, YERSON);
    c.origin = 'https://atacante.example';
    const r = await c.post('/api/timer/stop');
    assert.equal(r.status, 403);
    assert.match((r.body as { error: { message: string } }).error.message, /Origen/);
  });

  it('cerrar sesión invalida la cookie', async () => {
    const c = await loggedIn(s.url, YERSON);
    const saved = c.cookie;
    assert.equal((await c.post('/api/auth/logout')).status, 204);
    c.cookie = saved;
    assert.equal((await c.get('/api/bootstrap')).status, 401);
  });

  it('la sesión expira tras el tiempo configurado', async () => {
    const c = await loggedIn(s.url, RUBEN);
    s.clock.advance(4 * 60_000);
    assert.equal((await c.get('/api/bootstrap')).status, 200);
    s.clock.advance(13 * 3600_000);
    assert.equal((await c.get('/api/bootstrap')).status, 401);
  });

  it('cambiar la contraseña cierra las otras sesiones', async () => {
    const a = await loggedIn(s.url, WILSON);
    const b = await loggedIn(s.url, WILSON);
    const bad = await a.post('/api/auth/password', { currentPassword: 'mala', newPassword: 'NuevaClave2026' });
    assert.equal(bad.status, 422);
    const same = await a.post('/api/auth/password', { currentPassword: WILSON.password, newPassword: WILSON.password });
    assert.equal(same.status, 422);
    const weak = await a.post('/api/auth/password', { currentPassword: WILSON.password, newPassword: 'corta' });
    assert.equal(weak.status, 422);
    assert.equal((await a.post('/api/auth/password', { currentPassword: WILSON.password, newPassword: 'NuevaClave2026' })).status, 204);
    assert.equal((await a.get('/api/bootstrap')).status, 200);
    assert.equal((await b.get('/api/bootstrap')).status, 401);
    assert.equal((await new Client(s.url).login({ email: WILSON.email, password: 'NuevaClave2026' })).status, 200);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    const c = new Client(s.url);
    for (let i = 0; i < 5; i++) await c.login({ email: ADMIN.email, password: `Mala${i}clave1` });
    const locked = await c.login(ADMIN);
    assert.equal(locked.status, 401);
    assert.match((locked.body as unknown as { error: { message: string } }).error.message, /bloqueada/);
    s.clock.advance(16 * 60_000);
    assert.equal((await c.login(ADMIN)).status, 200);
  });

  it('limita la frecuencia de intentos de inicio de sesión', async () => {
    const c = new Client(s.url);
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await c.login({ email: 'limite@edulabs.test', password: 'x' })).status;
    assert.equal(last, 429);
  });
});
