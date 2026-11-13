import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AuditEntryDTO, BootstrapDTO, Page, SettingsDTO, TaskDTO, UserDTO, WeekResponse } from '../../src/shared/types.ts';
import { ADMIN, Client, createTestDatabase, dropTestDatabase, loggedIn, startServer, type TestServer, YERSON } from './helpers.ts';

describe('administración: equipo, ajustes y auditoría', () => {
  let s: TestServer;
  let admin: Client;
  let ye: Client;
  before(async () => {
    s = await startServer();
    admin = await loggedIn(s.url, ADMIN);
    ye = await loggedIn(s.url, YERSON);
  });
  after(async () => s.close());

  it('los colaboradores no administran ajustes ni personas', async () => {
    assert.equal((await ye.put('/api/settings', { capacityHours: 45 })).status, 403);
    assert.equal((await ye.post('/api/users', { email: 'x@y.co', name: 'X', role: 'member', password: 'Clave12345' })).status, 403);
    assert.equal((await ye.get('/api/audit')).status, 403);
    const users = (await ye.get<{ users: UserDTO[] }>('/api/users')).body.users;
    assert.equal(users.length, 3, 'un colaborador solo ve el equipo');
  });

  it('Coordinación cambia ajustes con validación', async () => {
    assert.equal((await admin.put('/api/settings', { capacityHours: 10 })).status, 422);
    assert.equal((await admin.put('/api/settings', {})).status, 422);
    const r = await admin.put<SettingsDTO>('/api/settings', { capacityHours: 45, defaultView: 'carga' });
    assert.deepEqual(r.body, { capacityHours: 45, defaultView: 'carga' });
    assert.deepEqual((await ye.get<SettingsDTO>('/api/settings')).body, { capacityHours: 45, defaultView: 'carga' });
  });

  it('crea personas, evita correos duplicados y las agrega al equipo', async () => {
    const r = await admin.post<UserDTO>('/api/users', { email: 'Ana.Perez@EduLabs.test', name: 'Ana Pérez', role: 'member', password: 'ClaveSegura2026' });
    assert.equal(r.status, 201);
    assert.equal(r.body.email, 'ana.perez@edulabs.test');
    assert.equal(r.body.initials, 'AP');
    assert.equal(r.body.inTeam, true);
    assert.equal((await admin.post('/api/users', { email: 'ana.perez@edulabs.test', name: 'Otra', role: 'member', password: 'ClaveSegura2026' })).status, 409);
    assert.equal((await admin.post('/api/users', { email: 'b@edulabs.test', name: 'B', role: 'member', password: 'debil' })).status, 422);
    const team = (await ye.get<BootstrapDTO>('/api/bootstrap')).body.team;
    assert.ok(team.some((u) => u.name === 'Ana Pérez'));
    const ana = await loggedIn(s.url, { email: 'ana.perez@edulabs.test', password: 'ClaveSegura2026' });
    assert.equal((await ana.get('/api/bootstrap')).status, 200);
  });

  it('desactivar a una persona cierra sus sesiones y protege al último coordinador', async () => {
    const users = (await admin.get<{ users: UserDTO[] }>('/api/users')).body.users;
    const yeUser = users.find((u) => u.email === YERSON.email);
    const adminUser = users.find((u) => u.email === ADMIN.email);
    assert.ok(yeUser && adminUser);
    assert.equal((await admin.patch(`/api/users/${adminUser.id}`, { role: 'member' })).status, 422);
    assert.equal((await admin.patch(`/api/users/${adminUser.id}`, { active: false })).status, 422);
    assert.equal((await admin.patch('/api/users/no-existe', { active: false })).status, 404);
    const off = await admin.patch<UserDTO>(`/api/users/${yeUser.id}`, { active: false });
    assert.equal(off.body.active, false);
    assert.equal((await ye.get('/api/bootstrap')).status, 401);
    assert.equal((await new Client(s.url).login(YERSON)).status, 401);
    const team = (await admin.get<BootstrapDTO>('/api/bootstrap')).body.team;
    assert.equal(team.some((u) => u.id === yeUser.id), false, 'sale del equipo visible');
    const w = (await admin.get<WeekResponse>('/api/weeks/2026-W45')).body;
    assert.ok(w.tasks.some((t: TaskDTO) => t.assignees.some((a) => a.userId === yeUser.id)), 'su historial se conserva');
    await admin.patch(`/api/users/${yeUser.id}`, { active: true, password: 'Reactivado2026' });
    assert.equal((await new Client(s.url).login({ email: YERSON.email, password: 'Reactivado2026' })).status, 200);
  });

  it('registra la auditoría con paginación', async () => {
    const p1 = await admin.get<Page<AuditEntryDTO>>('/api/audit?limit=5&offset=0');
    assert.equal(p1.status, 200);
    assert.equal(p1.body.items.length, 5);
    assert.ok(p1.body.total > 5);
    const p2 = await admin.get<Page<AuditEntryDTO>>('/api/audit?limit=5&offset=5');
    assert.notEqual(p1.body.items[0]?.id, p2.body.items[0]?.id);
    const actions = new Set((await admin.get<Page<AuditEntryDTO>>('/api/audit?limit=100')).body.items.map((a) => a.action));
    for (const a of ['auth.login', 'settings.update', 'user.create', 'user.update']) assert.ok(actions.has(a), a);
    assert.equal((await admin.get('/api/audit?limit=-1')).status, 400);
    assert.equal((await admin.get<Page<AuditEntryDTO>>('/api/audit?limit=1000')).body.limit, 100);
  });
});

describe('capa HTTP y seguridad', () => {
  let s: TestServer;
  let c: Client;
  before(async () => {
    s = await startServer();
    const pub = s.config.publicDir;
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html><title>app</title>');
    fs.writeFileSync(path.join(pub, 'app.js'), 'console.log(1)');
    fs.writeFileSync(path.join(path.dirname(pub), 'secreto.txt'), 'no');
    c = await loggedIn(s.url, YERSON);
  });
  after(async () => s.close());

  it('envía cabeceras de seguridad', async () => {
    const r = await c.get('/api/health');
    const csp = r.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.headers.get('x-request-id'));
  });

  it('sirve la interfaz, aplica el fallback SPA y bloquea path traversal', async () => {
    const index = await c.get('/');
    assert.equal(index.status, 200);
    assert.match(String(index.body), /<title>app<\/title>/);
    assert.equal((await c.get('/semana/2026-W45')).status, 200, 'rutas sin extensión devuelven index.html');
    const js = await fetch(s.url + '/app.js');
    assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await c.get('/no-existe.js')).status, 404);
    assert.equal((await c.get('/%2e%2e/secreto.txt')).status, 404);
    assert.equal((await c.get('/..%2fsecreto.txt')).status, 404);
    assert.equal((await c.req('POST', '/')).status, 405);
    assert.equal((await fetch(s.url + '/', { method: 'HEAD' })).status, 200);
  });

  it('rechaza cuerpos inválidos, demasiado grandes o de otro tipo', async () => {
    assert.equal((await c.req('POST', '/api/weeks/2026-W45/tasks', '{malo', { 'Content-Type': 'application/json' })).status, 400);
    assert.equal((await c.req('POST', '/api/weeks/2026-W45/tasks', 'name=x', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
    const big = JSON.stringify({ type: 'plan', name: 'x', description: 'a'.repeat(200 * 1024) });
    assert.equal((await c.req('POST', '/api/weeks/2026-W45/tasks', big)).status, 413);
    assert.equal((await c.req('POST', '/api/weeks/2026-W45/tasks', '[]')).status, 422);
  });

  it('responde 404 y 405 en la API con el formato de error estándar', async () => {
    const nf = await c.get<{ error: { code: string } }>('/api/no-existe');
    assert.equal(nf.status, 404);
    assert.equal(nf.body.error.code, 'not_found');
    const na = await c.req('PUT', '/api/health');
    assert.equal(na.status, 405);
    assert.equal(na.headers.get('allow'), 'GET');
    assert.equal((await c.req('OPTIONS', '/api/health')).status, 204);
  });

  it('permite CORS solo a orígenes configurados', async () => {
    const s2 = await startServer({ env: { CORS_ORIGINS: 'https://intranet.edulabs.test' } });
    try {
      const ok = await fetch(s2.url + '/api/health', { headers: { Origin: 'https://intranet.edulabs.test' } });
      assert.equal(ok.headers.get('access-control-allow-origin'), 'https://intranet.edulabs.test');
      const no = await fetch(s2.url + '/api/health', { headers: { Origin: 'https://otro.test' } });
      assert.equal(no.headers.get('access-control-allow-origin'), null);
      assert.equal((await fetch(s2.url + '/api/health', { method: 'OPTIONS', headers: { Origin: 'https://otro.test' } })).status, 403);
    } finally {
      await s2.close();
    }
  });

  it('las consultas parametrizadas neutralizan inyección SQL', async () => {
    const evil = "x'); DROP TABLE tasks; --";
    const r = await c.post<TaskDTO>('/api/weeks/2026-W45/tasks', { type: 'plan', name: evil });
    assert.equal(r.status, 201);
    assert.equal(r.body.name, evil);
    assert.equal((await c.get<WeekResponse>('/api/weeks/2026-W45')).body.tasks.some((t) => t.name === evil), true);
    assert.equal((await new Client(s.url).login({ email: "'or'1'='1@x.co", password: "' OR '1'='1" })).status, 401);
  });

  it('limita la tasa general de la API', async () => {
    const s3 = await startServer({ env: { API_RATE_LIMIT: '10' } });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await fetch(s3.url + '/api/health')).status);
      assert.equal(statuses.at(-1), 429);
    } finally {
      await s3.close();
    }
  });
});

describe('persistencia', () => {
  it('los datos se conservan al reiniciar la aplicación', async () => {
    const dbUrl = await createTestDatabase();
    try {
      const s1 = await startServer({ dbUrl });
      const c1 = await loggedIn(s1.url, YERSON);
      const created = await c1.post<TaskDTO>('/api/weeks/2026-W45/tasks', { type: 'extra', name: 'Persistente', project: 'Interno' });
      assert.equal(created.status, 201);
      await s1.close();

      const s2 = await startServer({ dbUrl });
      try {
        const c2 = await loggedIn(s2.url, YERSON);
        const t = (await c2.get<WeekResponse>('/api/weeks/2026-W45')).body.tasks.find((x) => x.name === 'Persistente');
        assert.ok(t, 'la tarea sigue existiendo');
        assert.equal(t.project, 'Interno');
        const migrations = await s2.db.all<{ id: number }>('SELECT id FROM schema_migrations');
        assert.deepEqual(
          migrations.map((m) => m.id),
          [1],
          'las migraciones no se reaplican',
        );
      } finally {
        await s2.close();
      }
    } finally {
      await dropTestDatabase(dbUrl);
    }
  });

  it('las restricciones de integridad impiden datos inconsistentes', async () => {
    const s = await startServer();
    try {
      const w = await s.db.get<{ id: string; week_id: string }>("SELECT id, week_id FROM tasks WHERE status = 'doing' LIMIT 1");
      assert.ok(w);
      const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;
      await assert.rejects(s.db.run("UPDATE tasks SET status = 'done' WHERE id = $id", { id: w.id }), code('23514'), 'done ⇔ 100 %');
      await assert.rejects(s.db.run('UPDATE tasks SET progress = 120 WHERE id = $id', { id: w.id }), code('23514'));
      await assert.rejects(s.db.run('UPDATE tasks SET delay_by_task_id = id WHERE id = $id', { id: w.id }), code('23514'), 'no se justifica a sí misma');
      await assert.rejects(
        s.db.run('INSERT INTO task_assignees (task_id, user_id, estimate_minutes) VALUES ($t, $u, 60)', { t: w.id, u: randomUUID() }),
        code('23503'),
        'clave foránea a users',
      );
      await assert.rejects(s.db.run("INSERT INTO weeks (id, iso_year, iso_week, monday) VALUES ('2026-W50', 2026, 50, '2026-12-08')", {}), code('23514'), 'el lunes debe ser lunes');
      await assert.rejects(s.db.run("UPDATE users SET email = 'MAYUS@X.CO' WHERE role = 'admin'", {}), code('23514'), 'correo en minúsculas');
      await assert.rejects(s.db.run("INSERT INTO weeks (id, iso_year, iso_week, monday) VALUES ('2026-W45', 2026, 45, '2026-11-02')", {}), code('23505'));
      await assert.rejects(
        s.db.transaction(async () => {
          await s.db.run("UPDATE tasks SET name = 'cambiado' WHERE id = $id", { id: w.id });
          throw new Error('falla');
        }),
        /falla/,
      );
      assert.notEqual((await s.db.get<{ name: string }>('SELECT name FROM tasks WHERE id = $id', { id: w.id }))?.name, 'cambiado', 'la transacción se revierte');
      const nested = await s.db.transaction(async () => {
        await s.db.run("UPDATE tasks SET description = 'externa' WHERE id = $id", { id: w.id });
        try {
          await s.db.transaction(async () => {
            await s.db.run("UPDATE tasks SET project = 'interno' WHERE id = $id", { id: w.id });
            throw new Error('anidada');
          });
        } catch {
          // savepoint revertido
        }
        return s.db.get<{ project: string; description: string }>('SELECT project, description FROM tasks WHERE id = $id', { id: w.id });
      });
      assert.notEqual(nested?.project, 'interno', 'el savepoint se revierte');
      assert.equal(nested?.description, 'externa', 'la transacción externa continúa');
      await assert.rejects(s.db.all('SELECT $falta AS x', {}), /Falta el parámetro/);
    } finally {
      await s.close();
    }
  });

  it('con DB_AUTO_MIGRATE=false el servidor exige el esquema al día', async () => {
    const { connectForServer } = await import('../../src/server/db/connect.ts');
    const { loadConfig } = await import('../../src/server/config.ts');
    const { migrate } = await import('../../src/server/db/database.ts');
    const dbUrl = await createTestDatabase();
    try {
      const cfg = loadConfig({ NODE_ENV: 'test', DATABASE_URL: dbUrl, DB_AUTO_MIGRATE: 'false' });
      await assert.rejects(connectForServer(cfg), /faltan las migraciones 1/);
      const auto = await connectForServer(loadConfig({ NODE_ENV: 'test', DATABASE_URL: dbUrl }));
      assert.deepEqual(await migrate(auto), [], 'ya aplicadas al conectar');
      await auto.close();
      const strict = await connectForServer(cfg);
      assert.equal((await strict.get<{ n: number }>('SELECT count(*) AS n FROM schema_migrations'))?.n, 1);
      await strict.close();
    } finally {
      await dropTestDatabase(dbUrl);
    }
  });

  it('la API traduce violaciones de restricciones en errores HTTP claros', async () => {
    const { mapDatabaseError } = await import('../../src/server/app.ts');
    const { PgError } = await import('../../src/server/db/pg/connection.ts');
    const mk = (code: string) => new PgError({ severity: 'ERROR', code, message: 'x' });
    assert.equal(mapDatabaseError(mk('23505'))?.status, 409);
    assert.equal(mapDatabaseError(mk('23503'))?.status, 422);
    assert.equal(mapDatabaseError(mk('23514'))?.status, 422);
    assert.equal(mapDatabaseError(mk('22P02'))?.status, 400);
    assert.equal(mapDatabaseError(mk('40P01'))?.status, 409);
    assert.equal(mapDatabaseError(mk('57014'))?.status, 503);
    assert.equal(mapDatabaseError(mk('42601')), null);
    assert.equal(mapDatabaseError(new Error('x')), null);
  });
});
