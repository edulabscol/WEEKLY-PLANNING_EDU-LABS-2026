import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { loadConfig } from '../../src/server/config.ts';
import { appliedMigrations, createDatabase, dialectOf, migrate, pendingMigrations, sqlitePath } from '../../src/server/db/database.ts';
import { describeDatabase } from '../../src/server/db/describe.ts';
import { DatabaseError } from '../../src/server/db/errors.ts';
import { SqliteDatabase, toDatabaseError } from '../../src/server/db/sqlite.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planeacion_sqlite_'));

describe('adaptador SQLite (desarrollo local)', () => {
  let db: SqliteDatabase;
  before(async () => {
    db = new SqliteDatabase(path.join(dir, 'sub', 'app.db'));
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, flag INTEGER, n INTEGER CONSTRAINT t_n_chk CHECK (n >= 0))');
  });
  after(async () => {
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('crea la carpeta del archivo y usa parámetros con nombre (con booleanos y valores repetidos)', async () => {
    assert.ok(fs.existsSync(path.join(dir, 'sub', 'app.db')));
    await db.run('INSERT INTO t (name, flag, n) VALUES ($name, $flag, $n)', { name: 'a', flag: true, n: 1 });
    await db.run('INSERT INTO t (name, flag, n) VALUES ($name, $flag, $n)', { name: "o'b", flag: false, n: 2 });
    const rows = await db.all<{ name: string; flag: number }>("SELECT name, flag FROM t WHERE n >= $min OR name = '$no' ORDER BY id", { min: 1, sobra: 'ignorado' });
    assert.deepEqual(rows.map((r) => [r.name, r.flag]), [['a', 1], ["o'b", 0]]);
    assert.equal((await db.get<{ c: number }>('SELECT count(*) AS c FROM t WHERE n = $x OR n = $x', { x: 2 }))?.c, 1);
    await assert.rejects(db.all('SELECT $falta'), /Falta el parámetro SQL \$falta/);
  });

  it('traduce errores de SQLite a códigos SQLSTATE', async () => {
    const code = (c: string) => (e: unknown) => e instanceof DatabaseError && e.code === c;
    await assert.rejects(db.run("INSERT INTO t (name, n) VALUES ('a', 1)"), code('23505'));
    await assert.rejects(db.run("INSERT INTO t (name, n) VALUES ('z', -1)"), (e: unknown) => code('23514')(e) && (e as DatabaseError).constraint === 't_n_chk');
    await assert.rejects(db.run('INSERT INTO t (name) VALUES (NULL)'), code('23502'));
    await assert.rejects(db.all('SELECT * FROM no_existe'), code('42P01'));
    const other = new Error('otro');
    assert.equal(toDatabaseError(other), other);
    assert.equal(toDatabaseError('x'), 'x');
  });

  it('revierte transacciones y savepoints', async () => {
    await assert.rejects(
      db.transaction(async () => {
        await db.run("UPDATE t SET n = 100 WHERE name = 'a'");
        throw new Error('falla');
      }),
      /falla/,
    );
    assert.equal((await db.get<{ n: number }>("SELECT n FROM t WHERE name = 'a'"))?.n, 1);
    const r = await db.transaction(async () => {
      await db.run("UPDATE t SET n = 10 WHERE name = 'a'");
      await assert.rejects(
        db.transaction(async () => {
          await db.run("UPDATE t SET n = 20 WHERE name = 'a'");
          throw new Error('interna');
        }),
      );
      assert.equal(db.inTransaction(), true);
      return db.get<{ n: number }>("SELECT n FROM t WHERE name = 'a'");
    });
    assert.equal(r?.n, 10);
    assert.equal(db.inTransaction(), false);
    await assert.rejects(db.transaction(async () => db.run("INSERT INTO t (name, n) VALUES ('a', 1)")), (e: unknown) => e instanceof DatabaseError && e.code === '23505');
  });

  it('serializa transacciones concurrentes y nadie lee datos no confirmados', async () => {
    const order: string[] = [];
    const seen: number[] = [];
    const tick = () => new Promise((res) => setTimeout(res, 15));
    const read = () => db.get<{ n: number }>("SELECT n FROM t WHERE name = 'a'").then((r) => seen.push(r?.n ?? -1));
    const t1 = db.transaction(async () => {
      order.push('t1:inicio');
      await db.run("UPDATE t SET n = n + 1 WHERE name = 'a'");
      await tick();
      order.push('t1:fin');
    });
    const r1 = read();
    const t2 = db
      .transaction(async () => {
        order.push('t2:inicio');
        await db.run("UPDATE t SET n = 999 WHERE name = 'a'");
        await tick();
        order.push('t2:fin');
        throw new Error('se revierte');
      })
      .catch(() => undefined);
    const r2 = read();
    await tick();
    const r3 = read();
    await Promise.all([t1, t2, r1, r2, r3]);
    assert.deepEqual(order, ['t1:inicio', 't1:fin', 't2:inicio', 't2:fin'], 'las transacciones no se intercalan');
    assert.ok(!seen.includes(999), `ninguna lectura ve el valor no confirmado de t2 (vio ${seen.join(', ')})`);
    assert.ok(seen.every((n) => n === 11));
  });

  it('respalda en caliente, migra de forma idempotente y elimina tablas', async () => {
    const target = path.join(dir, 'copia.db');
    await db.backupTo(target);
    const copy = new SqliteDatabase(target);
    assert.equal((await copy.get<{ c: number }>('SELECT count(*) AS c FROM t'))?.c, 2);
    await copy.close();

    assert.equal((await pendingMigrations(db)).length, 1);
    assert.equal((await migrate(db)).length, 1);
    assert.deepEqual(await migrate(db), []);
    assert.deepEqual(await appliedMigrations(db), [1]);
    await db.lockForTransaction(1);
    await db.dropAllTables();
    assert.equal((await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'tasks', 'schema_migrations')")).length, 0);
  });
});

describe('selección del motor de base de datos', () => {
  it('elige el motor por la URL', async () => {
    assert.equal(dialectOf('sqlite:./data/x.db'), 'sqlite');
    assert.equal(dialectOf('postgres://u@h/b'), 'postgres');
    assert.equal(dialectOf('postgresql://u@h/b'), 'postgres');
    assert.throws(() => dialectOf('mysql://h/b'), /DATABASE_URL/);
    assert.equal(sqlitePath('sqlite:./data/x.db'), './data/x.db');
    assert.equal(sqlitePath('sqlite://C:/datos/x.db'), 'C:/datos/x.db');
    assert.throws(() => sqlitePath('sqlite:'), /ruta/);
    const mem = await createDatabase({ url: 'sqlite::memory:' });
    assert.equal(mem.dialect, 'sqlite');
    await mem.close();
  });

  it('describe la conexión sin exponer contraseñas', () => {
    assert.deepEqual(describeDatabase('sqlite:./data/planeacion.db'), { dialect: 'sqlite', file: path.resolve('./data/planeacion.db') });
    const pg = describeDatabase('postgres://app:secreta@db:5432/plan?sslmode=require');
    assert.deepEqual(pg, { dialect: 'postgres', host: 'db', port: 5432, database: 'plan', user: 'app', sslmode: 'require' });
    assert.equal(JSON.stringify(pg).includes('secreta'), false);
  });

  it('usa SQLite por defecto en desarrollo y exige DATABASE_URL en producción', () => {
    assert.equal(loadConfig({}).database.url, 'sqlite:./data/planeacion.db');
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
    assert.equal(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h/b' }).database.autoMigrate, true);
  });
});
