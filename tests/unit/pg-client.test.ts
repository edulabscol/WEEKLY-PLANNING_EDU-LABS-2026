import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { md5Password, ScramSession } from '../../src/server/db/pg/auth.ts';
import {
  extendedQuery,
  MessageSplitter,
  parseDataRow,
  parseErrorFields,
  parseRowDescription,
  rowCountFromTag,
  startupMessage,
  Writer,
} from '../../src/server/db/pg/messages.ts';
import { parseDatabaseUrl } from '../../src/server/db/pg/pool.ts';
import { parseValue, serializeValue, toIso, toPositional } from '../../src/server/db/pg/types.ts';

describe('cliente PostgreSQL: autenticación', () => {
  it('SCRAM-SHA-256 reproduce el vector de prueba del RFC 7677', () => {
    const s = new ScramSession('pencil', 'rOprNGfwEbeRWgbNEkqO', 'user');
    assert.equal(s.clientFirst(), 'n,,n=user,r=rOprNGfwEbeRWgbNEkqO');
    const serverFirst = 'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096';
    assert.equal(s.clientFinal(serverFirst), 'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=');
    assert.doesNotThrow(() => s.verifyServerFinal('v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4='));
    assert.throws(() => s.verifyServerFinal('v=AAAA'), /firma del servidor/);
    assert.throws(() => s.verifyServerFinal('e=invalid-proof'), /rechazó/);
  });

  it('SCRAM rechaza respuestas del servidor manipuladas', () => {
    const s = new ScramSession('x', 'abc');
    s.clientFirst();
    assert.throws(() => s.clientFinal('r=otro,s=c2FsdA==,i=4096'), /nonce/);
    assert.throws(() => s.clientFinal('r=abc,s=c2FsdA==,i=4096'), /nonce/);
    assert.throws(() => s.clientFinal('r=abcdef,i=4096'), /incompleta/);
    assert.throws(() => new ScramSession('x').verifyServerFinal('v=AAAA'), /firma/);
  });

  it('MD5 sigue el formato de PostgreSQL', () => {
    // md5(md5(password + usuario) + sal), calculado de forma independiente
    const inner = createHash('md5').update('secretpostgres').digest('hex');
    const expected = 'md5' + createHash('md5').update(Buffer.concat([Buffer.from(inner), Buffer.from([1, 2, 3, 4])])).digest('hex');
    assert.equal(md5Password('postgres', 'secret', Buffer.from([1, 2, 3, 4])), expected);
    assert.match(md5Password('u', 'p', Buffer.alloc(4)), /^md5[0-9a-f]{32}$/);
    assert.notEqual(md5Password('u', 'p', Buffer.alloc(4)), md5Password('u', 'p', Buffer.from([1, 0, 0, 0])));
  });
});

describe('cliente PostgreSQL: mensajes del protocolo', () => {
  it('construye el mensaje de inicio y consultas extendidas', () => {
    const st = startupMessage({ user: 'u', database: 'd' });
    assert.equal(st.readInt32BE(0), st.length);
    assert.equal(st.readInt32BE(4), 196608);
    assert.ok(st.includes(Buffer.from('user\0u\0database\0d\0\0')));
    const q = extendedQuery('SELECT $1', ['ñ', null]);
    assert.equal(String.fromCharCode(q[0] ?? 0), 'P');
    for (const t of ['B', 'D', 'E', 'S']) assert.ok(q.includes(Buffer.from(t)), t);
    assert.ok(q.includes(Buffer.from([0xff, 0xff, 0xff, 0xff])), 'NULL se envía con longitud -1');
  });

  it('divide el flujo TCP en mensajes aunque lleguen fragmentados', () => {
    const msg = (type: string, body: Buffer) => new Writer().bytes(body).message(type);
    const stream = Buffer.concat([msg('Z', Buffer.from('I')), msg('C', Buffer.from('SELECT 2\0'))]);
    const sp = new MessageSplitter();
    assert.deepEqual(sp.push(stream.subarray(0, 3)), []);
    const got = [...sp.push(stream.subarray(3, 9)), ...sp.push(stream.subarray(9))];
    assert.deepEqual(
      got.map((m) => m.type),
      ['Z', 'C'],
    );
    assert.equal(got[1]?.body.toString(), 'SELECT 2\0');
  });

  it('interpreta errores, descripciones de filas y filas de datos', () => {
    const err = parseErrorFields(Buffer.from('SERROR\0VERROR\0C23505\0Mduplicado\0Ddetalle\0nusers_email_uq\0\0'));
    assert.deepEqual(err, { severity: 'ERROR', code: '23505', message: 'duplicado', detail: 'detalle', constraint: 'users_email_uq' });
    const rd = new Writer().int16(1).cstring('n').int32(0).int16(0).int32(23).int16(4).int32(-1).int16(0).message('T').subarray(5);
    assert.deepEqual(parseRowDescription(rd), [{ name: 'n', typeOid: 23 }]);
    const dr = new Writer().int16(2).int32(2).bytes(Buffer.from('42')).int32(-1).message('D').subarray(5);
    assert.deepEqual(parseDataRow(dr), ['42', null]);
    assert.equal(rowCountFromTag('UPDATE 3'), 3);
    assert.equal(rowCountFromTag('INSERT 0 1'), 1);
    assert.equal(rowCountFromTag('BEGIN'), 0);
  });
});

describe('cliente PostgreSQL: tipos y parámetros', () => {
  it('convierte parámetros con nombre a posicionales sin tocar literales ni comentarios', () => {
    assert.deepEqual(toPositional('SELECT * FROM t WHERE a = $a AND b = $b OR a = $a'), { text: 'SELECT * FROM t WHERE a = $1 AND b = $2 OR a = $1', names: ['a', 'b'] });
    assert.deepEqual(toPositional("SELECT '$no' AS x, \"$col\", 'it''s $no' -- $comentario\n, $si"), { text: "SELECT '$no' AS x, \"$col\", 'it''s $no' -- $comentario\n, $1", names: ['si'] });
    assert.deepEqual(toPositional('SELECT $1, $$'), { text: 'SELECT $1, $$', names: [] });
  });

  it('serializa valores JS al formato de texto', () => {
    assert.equal(serializeValue(null), null);
    assert.equal(serializeValue(undefined), null);
    assert.equal(serializeValue(true), 'true');
    assert.equal(serializeValue(false), 'false');
    assert.equal(serializeValue(12.5), '12.5');
    assert.equal(serializeValue('ñ'), 'ñ');
    assert.throws(() => serializeValue(Number.NaN), /no finito/);
  });

  it('interpreta columnas por tipo y normaliza fechas a ISO UTC', () => {
    assert.equal(parseValue(23, '42'), 42);
    assert.equal(parseValue(20, '12345678901'), 12345678901);
    assert.equal(parseValue(1700, '1.50'), 1.5);
    assert.equal(parseValue(16, 't'), true);
    assert.equal(parseValue(16, 'f'), false);
    assert.equal(parseValue(1082, '2026-11-05'), '2026-11-05');
    assert.equal(parseValue(2950, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    assert.equal(parseValue(23, null), null);
    assert.equal(parseValue(1184, '2026-11-05 15:00:00.123456+00'), '2026-11-05T15:00:00.123Z');
    assert.equal(toIso('2026-11-05 10:00:00-05'), '2026-11-05T15:00:00.000Z');
    assert.equal(toIso('2026-11-05 10:00:00+05:30'), '2026-11-05T04:30:00.000Z');
    assert.equal(toIso('2026-11-05 15:00:00'), '2026-11-05T15:00:00.000Z');
    assert.equal(toIso('infinity'), 'infinity');
  });

  it('interpreta DATABASE_URL', () => {
    assert.deepEqual(parseDatabaseUrl('postgres://app%40x:cl%3Ave@db.local:6543/plan?sslmode=verify-full&sslrootcert=/etc/ca.pem'), {
      host: 'db.local',
      port: 6543,
      user: 'app@x',
      password: 'cl:ve',
      database: 'plan',
      sslMode: 'verify-full',
      sslRootCert: '/etc/ca.pem',
    });
    const d = parseDatabaseUrl('postgresql://u@[::1]/b');
    assert.equal(d.host, '::1');
    assert.equal(d.port, 5432);
    assert.equal(d.sslMode, 'prefer');
    assert.throws(() => parseDatabaseUrl('no url'), /URL válida/);
    assert.throws(() => parseDatabaseUrl('mysql://h/b'), /postgres/);
    assert.throws(() => parseDatabaseUrl('postgres://h/b?sslmode=allow'), /sslmode/);
    assert.throws(() => parseDatabaseUrl('postgres://h'), /nombre de la base/);
  });
});

describe('esquema publicado para el DBA', () => {
  it('deploy/postgres/schema.sql coincide con las migraciones', async () => {
    const { readFileSync } = await import('node:fs');
    const { renderSchema } = await import('../../scripts/export-schema.ts');
    assert.equal(readFileSync(new URL('../../deploy/postgres/schema.sql', import.meta.url), 'utf8'), renderSchema(), 'Ejecute: node scripts/export-schema.ts');
  });
});
