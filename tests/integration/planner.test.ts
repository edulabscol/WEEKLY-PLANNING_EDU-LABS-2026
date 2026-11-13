import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BootstrapDTO, TaskDTO, TimerDTO, WeekResponse } from '../../src/shared/types.ts';
import { ADMIN, type Client, loggedIn, RUBEN, startServer, type TestServer, YERSON } from './helpers.ts';

interface Ctx {
  s: TestServer;
  admin: Client;
  ye: Client;
  ru: Client;
  ids: Record<'admin' | 'ye' | 'ru' | 'wi', string>;
}

async function setup(env: Record<string, string> = {}): Promise<Ctx> {
  const s = await startServer({ env });
  const admin = await loggedIn(s.url, ADMIN);
  const ye = await loggedIn(s.url, YERSON);
  const ru = await loggedIn(s.url, RUBEN);
  const boot = (await admin.get<BootstrapDTO>('/api/bootstrap')).body;
  const byName = (n: string): string => boot.team.find((u) => u.firstName === n)?.id ?? '';
  return { s, admin, ye, ru, ids: { admin: boot.user.id, ye: byName('Yerson'), ru: byName('Rubén'), wi: byName('Wilson') } };
}

const week = async (c: Client, id = '2026-W45'): Promise<WeekResponse> => (await c.get<WeekResponse>(`/api/weeks/${id}`)).body;
const findTask = (w: WeekResponse, name: string): TaskDTO => {
  const t = w.tasks.find((x) => x.name === name);
  if (!t) throw new Error(`No existe la tarea ${name}`);
  return t;
};

describe('semanas', () => {
  let c: Ctx;
  before(async () => {
    c = await setup();
  });
  after(async () => c.s.close());

  it('devuelve las tareas sembradas del prototipo con horas y responsables', async () => {
    const w = await week(c.ye);
    assert.equal(w.exists, true);
    assert.equal(w.tasks.length, 19);
    assert.equal(w.tasks.filter((t) => t.type === 'plan').length, 12);
    const plugin = findTask(w, 'Actualización plugin de reportes');
    assert.equal(plugin.carriedFromWeek, '2026-W44');
    assert.equal(plugin.status, 'blocked');
    const outage = findTask(w, 'Caída de servidor campus Externado – soporte urgente');
    assert.equal(plugin.delayByTaskId, outage.id);
    const total = w.tasks.flatMap((t) => t.assignees).filter((a) => a.userId === c.ids.ye).reduce((x, a) => x + a.realSeconds, 0);
    assert.equal(total, 44.5 * 3600, 'horas normalizadas como en el prototipo');
    const prev = await week(c.ye, '2026-W44');
    assert.equal(prev.tasks.filter((t) => t.movedToWeek === '2026-W45').length, 3);
  });

  it('una semana sin tablero muestra las pendientes de la anterior', async () => {
    const w = await week(c.ye, '2026-W46');
    assert.equal(w.exists, false);
    assert.equal(w.previous?.weekId, '2026-W45');
    assert.equal(w.previous?.pending.length, 13, 'todas las no completadas, planeadas y adicionales');
    assert.equal(w.canCreate, false, 'un colaborador no puede crearla');
    assert.equal((await week(c.admin, '2026-W46')).canCreate, true);
    assert.equal((await c.ye.get('/api/weeks/2026-W99')).status, 400);
  });

  it('solo Coordinación crea tableros y respeta la secuencia de semanas', async () => {
    assert.equal((await c.ye.post('/api/weeks', { weekId: '2026-W46', carry: true })).status, 403);
    assert.equal((await c.admin.post('/api/weeks', { weekId: '2026-W48', carry: false })).status, 422);
    assert.equal((await c.admin.post('/api/weeks', { weekId: '2026-W45', carry: false })).status, 409);
    assert.equal((await c.admin.post('/api/weeks', { weekId: 'x', carry: false })).status, 422);
  });

  it('al crear la semana trae las pendientes con el tiempo restante como estimado', async () => {
    const before = await week(c.admin);
    const guion = findTask(before, 'Guion instruccional Módulo 3 – Diplomado FUCS');
    const evalM2 = findTask(before, 'Diseño de evaluación final Módulo 2');
    const r = await c.admin.post<WeekResponse>('/api/weeks', { weekId: '2026-W46', carry: true });
    assert.equal(r.status, 201);
    assert.equal(r.body.tasks.length, 13);
    assert.ok(r.body.tasks.every((t) => t.type === 'plan' && t.carriedFromWeek === '2026-W45'));
    const carriedGuion = findTask(r.body, guion.name);
    assert.equal(carriedGuion.assignees[0]?.estimateMinutes, 60, 'ya superó lo estimado: mínimo 1 h');
    assert.equal(carriedGuion.assignees[0]?.realSeconds, 0);
    const carriedEval = findTask(r.body, evalM2.name);
    const ye = evalM2.assignees.find((a) => a.userId === c.ids.ye);
    assert.ok(ye);
    assert.equal(carriedEval.assignees.find((a) => a.userId === c.ids.ye)?.estimateMinutes, Math.max(Math.round(ye.estimateMinutes - ye.realSeconds / 60), 60));
    const after45 = await week(c.admin);
    assert.equal(after45.tasks.filter((t) => t.movedToWeek === '2026-W46').length, 13);
    const boot = (await c.ye.get<BootstrapDTO>('/api/bootstrap')).body;
    assert.deepEqual(boot.weeks, ['2026-W44', '2026-W45', '2026-W46']);
  });

  it('puede crear un tablero vacío sin arrastrar tareas', async () => {
    const r = await c.admin.post<WeekResponse>('/api/weeks', { weekId: '2026-W47', carry: false });
    assert.equal(r.status, 201);
    assert.equal(r.body.tasks.length, 0);
  });
});

describe('tareas', () => {
  let c: Ctx;
  before(async () => {
    c = await setup();
  });
  after(async () => c.s.close());

  it('valida la creación y devuelve errores por campo', async () => {
    const r = await c.ye.post<{ error: { code: string; fields: Record<string, string> } }>('/api/weeks/2026-W45/tasks', { type: 'plan', name: '  ', priority: 'urgente' });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'validation_error');
    assert.ok(r.body.error.fields.name);
    assert.ok(r.body.error.fields.priority);
    const unknownUser = await c.ye.post('/api/weeks/2026-W45/tasks', { type: 'plan', name: 'X', assignees: [{ userId: 'no-existe', estimateMinutes: 60 }] });
    assert.equal(unknownUser.status, 422);
    const dup = await c.ye.post('/api/weeks/2026-W45/tasks', { type: 'plan', name: 'X', assignees: [{ userId: c.ids.ye, estimateMinutes: 60 }, { userId: c.ids.ye, estimateMinutes: 30 }] });
    assert.equal(dup.status, 422);
    assert.equal((await c.ye.post('/api/weeks/2026-W50/tasks', { type: 'plan', name: 'X' })).status, 404);
  });

  it('crea, edita, completa y reabre aplicando las reglas de negocio', async () => {
    const created = await c.ye.post<TaskDTO>('/api/weeks/2026-W45/tasks', {
      type: 'extra',
      name: '<script>alert(1)</script> Soporte',
      requestedBy: 'Cliente FUCS',
      dueDate: '2026-11-06',
      assignees: [{ userId: c.ids.ye, estimateMinutes: 90 }],
    });
    assert.equal(created.status, 201);
    const t = created.body;
    assert.equal(t.name, '<script>alert(1)</script> Soporte', 'se guarda como texto; React lo escapa al mostrar');
    assert.equal(t.status, 'todo');
    assert.equal(t.progress, 0);
    assert.equal(t.priority, 'media');
    assert.equal(t.createdBy, c.ids.ye);

    const prog = await c.ye.patch<TaskDTO>(`/api/tasks/${t.id}`, { progress: 40 });
    assert.equal(prog.body.status, 'doing');
    const done = await c.ye.patch<TaskDTO>(`/api/tasks/${t.id}`, { status: 'done' });
    assert.equal(done.body.progress, 100);
    const reopened = await c.ye.patch<TaskDTO>(`/api/tasks/${t.id}`, { status: 'review' });
    assert.deepEqual([reopened.body.status, reopened.body.progress], ['review', 90]);
    const undo = await c.ye.patch<TaskDTO>(`/api/tasks/${t.id}`, { status: 'doing', progress: 40 });
    assert.deepEqual([undo.body.status, undo.body.progress], ['doing', 40]);
    const edited = await c.ru.patch<TaskDTO>(`/api/tasks/${t.id}`, { name: 'Soporte FUCS', project: 'FUCS', priority: 'alta', description: 'Línea 1\nLínea 2', dueDate: null, type: 'plan' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.description, 'Línea 1\nLínea 2');
    assert.equal(edited.body.dueDate, null);
    assert.equal(edited.body.type, 'plan');
    assert.equal((await c.ru.patch(`/api/tasks/${t.id}`, {})).status, 422);
    assert.equal((await c.ru.patch(`/api/tasks/${t.id}`, { name: '' })).status, 422);
    assert.equal((await c.ru.patch(`/api/tasks/no-existe`, { name: 'x' })).status, 404);
  });

  it('la justificación de retraso solo admite tareas adicionales de la misma semana', async () => {
    const w = await week(c.ye);
    const plan = findTask(w, 'Storyboard Módulo 4');
    const extra = findTask(w, 'Integración SSO con Office 365');
    const otherPlan = findTask(w, 'Banco de infografías Unidad 2');
    assert.equal((await c.ye.patch(`/api/tasks/${plan.id}`, { delayByTaskId: otherPlan.id })).status, 422);
    assert.equal((await c.ye.patch(`/api/tasks/${plan.id}`, { delayByTaskId: plan.id })).status, 422);
    const prevExtra = findTask(await week(c.ye, '2026-W44'), 'Demo comercial para nuevo cliente');
    assert.equal((await c.ye.patch(`/api/tasks/${plan.id}`, { delayByTaskId: prevExtra.id })).status, 422);
    const ok = await c.ye.patch<TaskDTO>(`/api/tasks/${plan.id}`, { delayByTaskId: extra.id, delayReason: 'Se priorizó el SSO' });
    assert.equal(ok.body.delayByTaskId, extra.id);
    const cleared = await c.ye.patch<TaskDTO>(`/api/tasks/${plan.id}`, { delayByTaskId: null });
    assert.equal(cleared.body.delayByTaskId, null);
  });

  it('elimina con posibilidad de restaurar, según permisos', async () => {
    const t = (await c.ye.post<TaskDTO>('/api/weeks/2026-W45/tasks', { type: 'plan', name: 'Temporal' })).body;
    assert.equal((await c.ru.del(`/api/tasks/${t.id}`)).status, 403, 'otro colaborador no puede eliminarla');
    assert.equal((await c.ye.del(`/api/tasks/${t.id}`)).status, 204);
    assert.equal((await week(c.ye)).tasks.some((x) => x.id === t.id), false);
    assert.equal((await c.ye.patch(`/api/tasks/${t.id}`, { name: 'x' })).status, 404);
    const restored = await c.ye.post<TaskDTO>(`/api/tasks/${t.id}/restore`);
    assert.equal(restored.status, 200);
    assert.equal((await c.ye.post(`/api/tasks/${t.id}/restore`)).status, 409);
    const seeded = findTask(await week(c.ye), 'Storyboard Módulo 4');
    assert.equal((await c.ye.del(`/api/tasks/${seeded.id}`)).status, 403);
    assert.equal((await c.admin.del(`/api/tasks/${seeded.id}`)).status, 204, 'Coordinación puede eliminar cualquiera');
    assert.equal((await c.admin.del(`/api/tasks/${seeded.id}`)).status, 404);
  });
});

describe('responsables, tiempo y cronómetro', () => {
  let c: Ctx;
  let task: TaskDTO;
  before(async () => {
    c = await setup({ TIMER_MAX_HOURS: '1' });
    task = (await c.ye.post<TaskDTO>('/api/weeks/2026-W45/tasks', { type: 'plan', name: 'Medir tiempo', assignees: [{ userId: c.ids.ye, estimateMinutes: 120 }] })).body;
  });
  after(async () => c.s.close());

  it('agrega responsables y ajusta estimados', async () => {
    const r = await c.ye.put<TaskDTO>(`/api/tasks/${task.id}/assignees/${c.ids.ru}`, {});
    assert.equal(r.body.assignees.find((a) => a.userId === c.ids.ru)?.estimateMinutes, 60);
    const est = await c.ye.put<TaskDTO>(`/api/tasks/${task.id}/assignees/${c.ids.ru}`, { estimateMinutes: 150 });
    assert.equal(est.body.assignees.find((a) => a.userId === c.ids.ru)?.estimateMinutes, 150);
    assert.equal((await c.ye.put(`/api/tasks/${task.id}/assignees/no-existe`, {})).status, 422);
    assert.equal((await c.ye.put(`/api/tasks/${task.id}/assignees/${c.ids.ru}`, { estimateMinutes: -1 })).status, 422);
  });

  it('cada colaborador registra solo su propio tiempo; Coordinación puede corregir el de todos', async () => {
    assert.equal((await c.ye.post(`/api/tasks/${task.id}/time`, { userId: c.ids.ru, minutes: 30, source: 'quick' })).status, 403);
    assert.equal((await c.ye.put(`/api/tasks/${task.id}/assignees/${c.ids.ru}`, { realSeconds: 600 })).status, 403);
    const add = await c.ye.post<TaskDTO>(`/api/tasks/${task.id}/time`, { userId: c.ids.ye, minutes: 30, source: 'quick' });
    assert.equal(add.body.assignees.find((a) => a.userId === c.ids.ye)?.realSeconds, 1800);
    const set = await c.ye.put<TaskDTO>(`/api/tasks/${task.id}/assignees/${c.ids.ye}`, { realSeconds: 5400 });
    assert.equal(set.body.assignees.find((a) => a.userId === c.ids.ye)?.realSeconds, 5400, 'el ajuste fija el total');
    const adminSet = await c.admin.put<TaskDTO>(`/api/tasks/${task.id}/assignees/${c.ids.ru}`, { realSeconds: 900 });
    assert.equal(adminSet.body.assignees.find((a) => a.userId === c.ids.ru)?.realSeconds, 900);
    assert.equal((await c.admin.post(`/api/tasks/${task.id}/time`, { userId: c.ids.wi, minutes: 10, source: 'quick' })).status, 422, 'no es responsable');
    const entries = (await c.s.db.all<{ source: string }>('SELECT source FROM time_entries WHERE task_id = $id ORDER BY id', { id: task.id })).map((e) => e.source);
    assert.deepEqual(entries, ['quick', 'adjust', 'adjust']);
  });

  it('quitar a alguien con horas registradas requiere permiso sobre su tiempo', async () => {
    assert.equal((await c.ye.del(`/api/tasks/${task.id}/assignees/${c.ids.ru}`)).status, 403);
    assert.equal((await c.admin.del(`/api/tasks/${task.id}/assignees/${c.ids.wi}`)).status, 404);
  });

  it('el cronómetro registra el tiempo transcurrido y pasa la tarea a "En curso"', async () => {
    const start = await c.ye.post<{ timer: TimerDTO; task: TaskDTO; stopped: null }>('/api/timer/start', { taskId: task.id, userId: c.ids.ye });
    assert.equal(start.status, 201);
    assert.equal(start.body.task.status, 'doing');
    assert.equal(start.body.timer.weekId, '2026-W45');
    assert.equal((await c.ye.get<{ timer: TimerDTO }>('/api/timer')).body.timer.taskId, task.id);
    assert.equal((await c.admin.post('/api/timer/start', { taskId: task.id, userId: c.ids.ye })).status, 409, 'ya se está cronometrando');
    c.s.clock.advance(25 * 60_000);
    const before = (await c.ye.get<WeekResponse>('/api/weeks/2026-W45')).body.tasks.find((t) => t.id === task.id)?.assignees.find((a) => a.userId === c.ids.ye)?.realSeconds ?? 0;
    const stop = await c.ye.post<{ seconds: number; capped: boolean; task: TaskDTO }>('/api/timer/stop');
    assert.equal(stop.body.seconds, 1500);
    assert.equal(stop.body.capped, false);
    assert.equal(stop.body.task.assignees.find((a) => a.userId === c.ids.ye)?.realSeconds, before + 1500);
    assert.equal((await c.ye.post('/api/timer/stop')).status, 409);
    assert.equal((await c.ye.get<{ timer: null }>('/api/timer')).body.timer, null);
  });

  it('iniciar otro cronómetro detiene el anterior y un cronómetro olvidado se limita', async () => {
    const other = (await c.ye.post<TaskDTO>('/api/weeks/2026-W45/tasks', { type: 'extra', name: 'Otra', assignees: [{ userId: c.ids.ye, estimateMinutes: 60 }] })).body;
    await c.ye.post('/api/timer/start', { taskId: task.id, userId: c.ids.ye });
    c.s.clock.advance(10 * 60_000);
    const sw = await c.ye.post<{ stopped: { seconds: number; taskId: string } }>('/api/timer/start', { taskId: other.id, userId: c.ids.ye });
    assert.equal(sw.body.stopped.taskId, task.id);
    assert.equal(sw.body.stopped.seconds, 600);
    c.s.clock.advance(2 * 3600_000);
    const stop = await c.ye.post<{ seconds: number; capped: boolean }>('/api/timer/stop');
    assert.equal(stop.body.capped, true);
    assert.equal(stop.body.seconds, 3600, 'máximo configurado (TIMER_MAX_HOURS)');
  });

  it('valida a quién se cronometra y limpia el cronómetro al eliminar la tarea', async () => {
    assert.equal((await c.ye.post('/api/timer/start', { taskId: task.id, userId: c.ids.ru })).status, 403);
    assert.equal((await c.admin.post('/api/timer/start', { taskId: task.id, userId: c.ids.wi })).status, 422);
    assert.equal((await c.admin.post('/api/timer/start', { taskId: task.id, userId: c.ids.ru })).status, 201, 'Coordinación puede cronometrar a otros');
    assert.equal((await c.admin.del(`/api/tasks/${task.id}`)).status, 204);
    assert.equal((await c.admin.get<{ timer: null }>('/api/timer')).body.timer, null);
  });
});
