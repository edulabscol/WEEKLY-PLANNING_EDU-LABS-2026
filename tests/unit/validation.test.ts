import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addTimeSchema,
  arrayOf,
  bool,
  changePasswordSchema,
  color,
  createTaskSchema,
  createUserSchema,
  createWeekSchema,
  dateOrNull,
  id,
  idOrNull,
  integer,
  isUuid,
  loginSchema,
  object,
  oneOf,
  optional,
  passwordProblems,
  sanitizeText,
  settingsSchema,
  text,
  updateTaskSchema,
  updateUserSchema,
  upsertAssigneeSchema,
} from '../../src/shared/validation.ts';

describe('validadores básicos', () => {
  it('limpia caracteres de control y saltos en campos de una línea', () => {
    assert.equal(sanitizeText('a\u0000b\u0007c\nd'), 'abc\nd');
    const r = object({ s: text({ max: 50 }) }).parse({ s: '  hola\n mundo  ' });
    assert.deepEqual(r, { ok: true, value: { s: 'hola  mundo' } });
    const m = object({ s: text({ max: 50, multiline: true }) }).parse({ s: 'línea 1\nlínea 2' });
    assert.deepEqual(m, { ok: true, value: { s: 'línea 1\nlínea 2' } });
  });

  it('informa errores por campo', () => {
    const schema = object({ name: text({ min: 1, max: 5, label: 'El nombre' }), n: integer({ min: 0, max: 10 }), k: oneOf(['a', 'b']), f: bool() });
    const r = schema.parse({ name: '   ', n: 11.5, k: 'c', f: 'yes' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.errors.name, 'El nombre es obligatorio.');
      assert.equal(r.errors.n, 'Debe ser un número entero.');
      assert.equal(r.errors.k, 'Valor no permitido.');
      assert.equal(r.errors.f, 'Debe ser verdadero o falso.');
    }
    const r2 = schema.parse({ name: 'abcdefg', n: 20, k: 'a', f: true });
    assert.equal(r2.ok, false);
    if (!r2.ok) {
      assert.equal(r2.errors.name, 'Máximo 5 caracteres.');
      assert.equal(r2.errors.n, 'Debe estar entre 0 y 10.');
    }
    const r3 = object({ s: text({ min: 3, max: 9 }) }).parse({ s: 'ab' });
    assert.equal(!r3.ok && r3.errors.s, 'Debe tener al menos 3 caracteres.');
    assert.equal(!object({ s: text({ max: 3 }) }).parse({ s: 5 }).ok, true);
  });

  it('rechaza campos desconocidos, faltantes y entradas que no son objeto', () => {
    const schema = object({ a: integer({ min: 0, max: 1 }), b: optional(integer({ min: 0, max: 1 })) });
    const r = schema.parse({ a: 1, c: 2 });
    assert.equal(!r.ok && r.errors.c, 'Campo no permitido.');
    const r2 = schema.parse({});
    assert.equal(!r2.ok && r2.errors.a, 'Campo obligatorio.');
    assert.equal(schema.parse([]).ok, false);
    assert.equal(schema.parse(null).ok, false);
    assert.deepEqual(schema.parse({ a: 0 }), { ok: true, value: { a: 0 } });
  });

  it('valida fechas, identificadores, colores y listas', () => {
    const s = object({ d: dateOrNull(), i: idOrNull(), j: id(), c: color(), l: arrayOf(integer({ min: 0, max: 9 }), { max: 2 }) });
    assert.deepEqual(s.parse({ d: '', i: '', j: '11111111-1111-4111-8111-111111111111', c: '#abcdef', l: [1, 2] }), { ok: true, value: { d: null, i: null, j: '11111111-1111-4111-8111-111111111111', c: '#ABCDEF', l: [1, 2] } });
    const bad = s.parse({ d: '2026-02-30', i: 'a b', j: 5, c: 'red', l: [1, 2, 3] });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['c', 'd', 'i', 'j', 'l']);
    const badItem = s.parse({ d: null, i: null, j: '11111111-1111-4111-8111-111111111111', c: '#000000', l: [1, 99] });
    assert.equal(!badItem.ok && badItem.errors['l[1]'], 'Debe estar entre 0 y 9.');
    assert.equal(!s.parse({ d: null, i: null, j: '11111111-1111-4111-8111-111111111111', c: '#000000', l: 'no' }).ok, true);
    assert.equal(isUuid('11111111-1111-4111-8111-111111111111'), true);
    assert.equal(isUuid('no-existe'), false);
    assert.equal(isUuid(5), false);
  });

  it('aplica la política de contraseñas', () => {
    assert.match(passwordProblems('corta1') ?? '', /al menos 10/);
    assert.match(passwordProblems('sololetrasaqui') ?? '', /letras y números/);
    assert.match(passwordProblems('1234567890') ?? '', /letras y números/);
    assert.match(passwordProblems('a1'.repeat(70)) ?? '', /máximo 128/);
    assert.equal(passwordProblems('Equipo2026'), null);
  });
});

describe('esquemas de la API', () => {
  it('login normaliza el correo', () => {
    assert.deepEqual(loginSchema.parse({ email: ' Ana@Edu.CO ', password: 'x' }), { ok: true, value: { email: 'ana@edu.co', password: 'x' } });
    assert.equal(loginSchema.parse({ email: 'no-es-correo', password: 'x' }).ok, false);
    assert.equal(loginSchema.parse({ email: 'a@b.co', password: '' }).ok, false);
  });

  it('crear tarea exige tipo y nombre y valida responsables', () => {
    const ok = createTaskSchema.parse({ type: 'extra', name: ' SSO ', requestedBy: 'Cliente', dueDate: '2026-11-06', assignees: [{ userId: '11111111-1111-4111-8111-111111111111', estimateMinutes: 120 }] });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value.name, 'SSO');
    const bad = createTaskSchema.parse({ type: 'otro', name: '', assignees: [{ userId: '11111111-1111-4111-8111-111111111111', estimateMinutes: -1 }] });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.ok(bad.errors.type);
      assert.ok(bad.errors.name);
      assert.ok(bad.errors['assignees[0].estimateMinutes']);
    }
    assert.equal(createTaskSchema.parse({ type: 'plan', name: 'x'.repeat(201) }).ok, false);
  });

  it('actualizar tarea requiere al menos un cambio', () => {
    const r = updateTaskSchema.parse({});
    assert.equal(!r.ok && r.errors._, 'No hay cambios que aplicar.');
    assert.equal(updateTaskSchema.parse({ progress: 101 }).ok, false);
    assert.deepEqual(updateTaskSchema.parse({ delayByTaskId: '', dueDate: null }), { ok: true, value: { delayByTaskId: null, dueDate: null } });
  });

  it('valida el resto de esquemas', () => {
    assert.equal(createWeekSchema.parse({ weekId: '2026-W46', carry: true }).ok, true);
    assert.equal(createWeekSchema.parse({ weekId: '2026-W99', carry: true }).ok, false);
    assert.equal(upsertAssigneeSchema.parse({}).ok, true);
    assert.equal(upsertAssigneeSchema.parse({ realSeconds: -5 }).ok, false);
    assert.equal(addTimeSchema.parse({ userId: '11111111-1111-4111-8111-111111111111', minutes: 15, source: 'quick' }).ok, true);
    assert.equal(addTimeSchema.parse({ userId: '11111111-1111-4111-8111-111111111111', minutes: 0, source: 'quick' }).ok, false);
    assert.equal(addTimeSchema.parse({ userId: '11111111-1111-4111-8111-111111111111', minutes: 15, source: 'timer' }).ok, false);
    assert.equal(addTimeSchema.parse({ userId: 'u1', minutes: 15, source: 'quick' }).ok, false, 'el id debe ser uuid');
    assert.equal(settingsSchema.parse({ capacityHours: 19 }).ok, false);
    assert.equal(settingsSchema.parse({ capacityHours: 45, defaultView: 'carga' }).ok, true);
    assert.equal(createUserSchema.parse({ email: 'a@b.co', name: 'Ana', role: 'member', password: 'Clave12345' }).ok, true);
    assert.equal(createUserSchema.parse({ email: 'a@b.co', name: 'Ana', role: 'root', password: 'corta' }).ok, false);
    assert.equal(updateUserSchema.parse({ active: false }).ok, true);
    assert.equal(changePasswordSchema.parse({ currentPassword: 'x', newPassword: 'NuevaClave2026' }).ok, true);
  });
});
