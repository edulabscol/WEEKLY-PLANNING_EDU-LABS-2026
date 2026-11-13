import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createDatabase, dialectOf, migrate } from '../../src/server/db/database.ts';
import { migrationsFor } from '../../src/server/db/migrations.ts';
import type { AuditEntryDTO, BootstrapDTO, Page, WeekResponse } from '../../src/shared/types.ts';
import { ADMIN, type Client, createTestDatabase, dropTestDatabase, loggedIn, startServer, type TestServer, YERSON } from './helpers.ts';

describe('sprints: nombre de cada tablero semanal', () => {
  let s: TestServer;
  let admin: Client;
  let ye: Client;
  before(async () => {
    s = await startServer();
    admin = await loggedIn(s.url, ADMIN);
    ye = await loggedIn(s.url, YERSON);
  });
  after(async () => s.close());

  it('numera los tableros sembrados desde Sprint 0 (tablero de muestra)', async () => {
    const boot = (await ye.get<BootstrapDTO>('/api/bootstrap')).body;
    assert.deepEqual(boot.weekNames, { '2026-W44': 'Sprint 0', '2026-W45': 'Sprint 1' });
    assert.equal((await ye.get<WeekResponse>('/api/weeks/2026-W45')).body.week?.name, 'Sprint 1');
    const list = (await ye.get<{ weekNames: Record<string, string> }>('/api/weeks')).body;
    assert.equal(list.weekNames['2026-W44'], 'Sprint 0');
  });

  it('Coordinación cambia el nombre y queda en auditoría', async () => {
    const r = await admin.patch<WeekResponse>('/api/weeks/2026-W45', { name: '  Sprint 1 · Lanzamiento  ' });
    assert.equal(r.status, 200);
    assert.equal(r.body.week?.name, 'Sprint 1 · Lanzamiento', 'se guarda sin espacios sobrantes');
    assert.equal(r.body.tasks.length, 19, 'devuelve el tablero completo');
    assert.equal((await ye.get<BootstrapDTO>('/api/bootstrap')).body.weekNames['2026-W45'], 'Sprint 1 · Lanzamiento');
    const audit = (await admin.get<Page<AuditEntryDTO>>('/api/audit?limit=5')).body.items.find((a) => a.action === 'week.rename');
    assert.ok(audit, 'hay registro de auditoría');
    assert.equal(audit.entityId, '2026-W45');
    assert.match(audit.details, /Sprint 1 · Lanzamiento/);
  });

  it('valida permisos, nombre y semana', async () => {
    assert.equal((await ye.patch('/api/weeks/2026-W45', { name: 'Otro' })).status, 403, 'un colaborador no puede renombrar');
    assert.equal((await admin.patch('/api/weeks/2026-W45', { name: '   ' })).status, 422);
    assert.equal((await admin.patch('/api/weeks/2026-W45', { name: 'x'.repeat(61) })).status, 422);
    assert.equal((await admin.patch('/api/weeks/2026-W45', {})).status, 422);
    assert.equal((await admin.patch('/api/weeks/2026-W47', { name: 'Futuro' })).status, 404, 'sin tablero no hay sprint');
    assert.equal((await admin.patch('/api/weeks/nada', { name: 'X' })).status, 400);
    assert.equal((await ye.get<WeekResponse>('/api/weeks/2026-W45')).body.week?.name, 'Sprint 1 · Lanzamiento', 'sin cambios');
  });

  it('un tablero nuevo recibe el siguiente número de sprint', async () => {
    const r = await admin.post<WeekResponse>('/api/weeks', { weekId: '2026-W46', carry: false });
    assert.equal(r.status, 201);
    assert.equal(r.body.week?.name, 'Sprint 2');
  });
});

describe('sprints: migración de bases existentes', () => {
  let url: string;
  before(async () => {
    url = await createTestDatabase();
  });
  after(async () => dropTestDatabase(url));

  it('asigna Sprint 0, 1, … por orden de fecha a los tableros que ya existían', async () => {
    const db = await createDatabase({ url, poolMax: 1 });
    try {
      const all = migrationsFor(dialectOf(url));
      await migrate(db, all.filter((m) => m.id === 1));
      for (const [id, week, monday] of [
        ['2026-W45', 45, '2026-11-02'],
        ['2026-W43', 43, '2026-10-19'],
        ['2026-W44', 44, '2026-10-26'],
      ] as const) {
        await db.run('INSERT INTO weeks (id, iso_year, iso_week, monday) VALUES ($id, 2026, $w, $m)', { id, w: week, m: monday });
      }
      assert.ok((await migrate(db, all)).some((m) => m.id === 2));
      const rows = await db.all<{ id: string; name: string }>('SELECT id, name FROM weeks ORDER BY monday');
      assert.deepEqual(
        rows.map((r) => [r.id, r.name]),
        [
          ['2026-W43', 'Sprint 0'],
          ['2026-W44', 'Sprint 1'],
          ['2026-W45', 'Sprint 2'],
        ],
      );
      await assert.rejects(db.run("UPDATE weeks SET name = '  ' WHERE id = '2026-W43'"), 'la base rechaza nombres vacíos');
    } finally {
      await db.close();
    }
  });
});
