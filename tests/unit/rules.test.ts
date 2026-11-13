import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PROGRESS, priorityMeta, statusMeta } from '../../src/shared/constants.ts';
import {
  applyStatusProgressRules,
  carryEstimateMinutes,
  computeTeamLoad,
  computeWeekStats,
  estimateMinutes,
  filterTasks,
  firstNameOf,
  formatClock,
  formatMinutes,
  formatQuickAdd,
  formatSeconds,
  initialsOf,
  isOverdue,
  loadState,
  pendingLeftMinutes,
  realSeconds,
  sortByDue,
  sortForList,
  splitHM,
  weightedProgress,
  withLiveTimer,
} from '../../src/shared/rules.ts';
import type { TaskDTO, UserDTO } from '../../src/shared/types.ts';

function task(over: Partial<TaskDTO> & { a?: Array<[string, number, number]> } = {}): TaskDTO {
  const { a = [], ...rest } = over;
  return {
    id: Math.random().toString(36).slice(2),
    weekId: '2026-W45',
    type: 'plan',
    name: 'Tarea',
    description: '',
    project: '',
    requestedBy: '',
    status: 'todo',
    priority: 'media',
    progress: 0,
    dueDate: '2026-11-06',
    carriedFromWeek: null,
    movedToWeek: null,
    delayByTaskId: null,
    delayReason: '',
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    assignees: a.map(([userId, estH, realH]) => ({ userId, estimateMinutes: estH * 60, realSeconds: realH * 3600 })),
    ...rest,
  };
}

const user = (id: string, name: string): UserDTO => ({ id, name, email: `${id}@x.co`, firstName: name, initials: name.slice(0, 2).toUpperCase(), color: '#5E1A8C', role: 'member', jobTitle: 'Colaborador', inTeam: true, active: true });

describe('formato de tiempo', () => {
  it('formatea minutos como el prototipo', () => {
    assert.equal(formatMinutes(0), '0h');
    assert.equal(formatMinutes(45), '45m');
    assert.equal(formatMinutes(60), '1h');
    assert.equal(formatMinutes(135), '2h 15m');
    assert.equal(formatMinutes(-10), '0h');
    assert.equal(formatMinutes(59.6), '1h');
    assert.equal(formatSeconds(5400), '1h 30m');
  });
  it('divide, muestra reloj y etiquetas rápidas', () => {
    assert.deepEqual(splitHM(135), [2, 15]);
    assert.deepEqual(splitHM(-5), [0, 0]);
    assert.equal(formatClock(3725), '01:02:05');
    assert.equal(formatClock(-3), '00:00:00');
    assert.equal(formatQuickAdd(15), '15 min');
    assert.equal(formatQuickAdd(120), '2 h');
  });
});

describe('reglas de estado y avance', () => {
  it('completar fija el avance en 100 %', () => {
    assert.deepEqual(applyStatusProgressRules({ status: 'doing', progress: 40 }, { status: 'done' }), { status: 'done', progress: 100 });
  });
  it('reabrir una completada usa el avance por defecto del nuevo estado', () => {
    for (const s of ['todo', 'doing', 'review', 'blocked'] as const) {
      assert.deepEqual(applyStatusProgressRules({ status: 'done', progress: 100 }, { status: s }), { status: s, progress: DEFAULT_PROGRESS[s] });
    }
  });
  it('cambiar de estado sin pasar por completada conserva el avance', () => {
    assert.deepEqual(applyStatusProgressRules({ status: 'doing', progress: 70 }, { status: 'review' }), { status: 'review', progress: 70 });
  });
  it('avance 100 % completa; bajar de 100 reabre en curso; avanzar desde por hacer pasa a en curso', () => {
    assert.deepEqual(applyStatusProgressRules({ status: 'doing', progress: 90 }, { progress: 100 }), { status: 'done', progress: 100 });
    assert.deepEqual(applyStatusProgressRules({ status: 'done', progress: 100 }, { progress: 60 }), { status: 'doing', progress: 60 });
    assert.deepEqual(applyStatusProgressRules({ status: 'todo', progress: 0 }, { progress: 20 }), { status: 'doing', progress: 20 });
    assert.deepEqual(applyStatusProgressRules({ status: 'blocked', progress: 30 }, { progress: 40 }), { status: 'blocked', progress: 40 });
    assert.deepEqual(applyStatusProgressRules({ status: 'todo', progress: 10 }, { progress: 0 }), { status: 'todo', progress: 0 });
  });
  it('con estado y avance a la vez (deshacer) respeta ambos manteniendo la consistencia', () => {
    assert.deepEqual(applyStatusProgressRules({ status: 'done', progress: 100 }, { status: 'doing', progress: 60 }), { status: 'doing', progress: 60 });
    assert.deepEqual(applyStatusProgressRules({ status: 'todo', progress: 0 }, { status: 'done', progress: 20 }), { status: 'done', progress: 100 });
    assert.deepEqual(applyStatusProgressRules({ status: 'todo', progress: 0 }, { status: 'review', progress: 100 }), { status: 'done', progress: 100 });
  });
  it('sin cambios devuelve una copia del estado actual', () => {
    const cur = { status: 'review' as const, progress: 90 };
    const r = applyStatusProgressRules(cur, {});
    assert.deepEqual(r, cur);
    assert.notEqual(r, cur);
  });
});

describe('horas, arrastre y avance ponderado', () => {
  const t = task({ a: [['ye', 6, 4], ['ru', 2, 0]] });
  it('suma estimado y real total o por persona', () => {
    assert.equal(estimateMinutes(t), 480);
    assert.equal(estimateMinutes(t, 'ye'), 360);
    assert.equal(realSeconds(t), 4 * 3600);
    assert.equal(realSeconds(t, 'ru'), 0);
  });
  it('el estimado arrastrado es lo que falta con mínimo de 1 h', () => {
    assert.equal(carryEstimateMinutes({ estimateMinutes: 360, realSeconds: 4 * 3600 }), 120);
    assert.equal(carryEstimateMinutes({ estimateMinutes: 60, realSeconds: 3 * 3600 }), 60);
    assert.equal(pendingLeftMinutes(t), 240);
    assert.equal(pendingLeftMinutes(task({ a: [['ye', 1, 5]] })), 60);
  });
  it('pondera el avance por estimado (tareas sin estimado pesan 1 h)', () => {
    assert.equal(weightedProgress([]), 0);
    assert.equal(weightedProgress([task({ progress: 100, a: [['ye', 3, 0]] }), task({ progress: 0, a: [['ye', 1, 0]] })]), 75);
    assert.equal(weightedProgress([task({ progress: 50 }), task({ progress: 100, a: [['ye', 1, 0]] })]), 75);
  });
  it('determina vencidas', () => {
    assert.equal(isOverdue(task({ dueDate: '2026-11-04' }), '2026-11-05'), true);
    assert.equal(isOverdue(task({ dueDate: '2026-11-05' }), '2026-11-05'), false);
    assert.equal(isOverdue(task({ dueDate: '2026-11-04', status: 'done', progress: 100 }), '2026-11-05'), false);
    assert.equal(isOverdue(task({ dueDate: null }), '2026-11-05'), false);
  });
  it('suma el cronómetro en curso solo a la persona y tarea correctas', () => {
    const live = withLiveTimer([t], { taskId: t.id, userId: 'ru' }, 90);
    assert.equal(live[0]?.assignees.find((a) => a.userId === 'ru')?.realSeconds, 90);
    assert.equal(live[0]?.assignees.find((a) => a.userId === 'ye')?.realSeconds, 4 * 3600);
    assert.equal(withLiveTimer([t], null, 50)[0], t);
    assert.equal(withLiveTimer([t], { taskId: 'otra', userId: 'ru' }, 50)[0], t);
  });
});

describe('filtros, orden e indicadores', () => {
  const team = [user('ye', 'Yerson'), user('ru', 'Rubén')];
  const tasks = [
    task({ name: 'Integración SSO', project: 'One Link', type: 'extra', status: 'review', progress: 90, dueDate: '2026-11-05', requestedBy: 'Cliente', a: [['ru', 6, 8]] }),
    task({ name: 'Guion M3', project: 'FUCS', status: 'doing', progress: 70, dueDate: '2026-11-04', a: [['ye', 10, 16]] }),
    task({ name: 'Plugin', project: 'Externado', status: 'blocked', progress: 30, dueDate: '2026-10-30', a: [['ru', 3, 2]] }),
    task({ name: 'SCORM', project: 'FUCS', status: 'done', progress: 100, dueDate: '2026-11-03', a: [['ru', 4, 4], ['ye', 2, 2.5]] }),
  ];

  it('filtra por persona y por texto (nombre, proyecto o solicitante)', () => {
    assert.equal(filterTasks(tasks, { userId: 'ye', query: '' }).length, 2);
    assert.deepEqual(
      filterTasks(tasks, { userId: null, query: '  fucs ' }).map((t) => t.name),
      ['Guion M3', 'SCORM'],
    );
    assert.equal(filterTasks(tasks, { userId: null, query: 'cliente' }).length, 1);
    assert.equal(filterTasks(tasks, { userId: 'ye', query: 'sso' }).length, 0);
  });

  it('ordena la lista por estado y luego por fecha', () => {
    assert.deepEqual(
      sortForList(tasks).map((t) => t.status),
      ['blocked', 'doing', 'review', 'done'],
    );
    assert.deepEqual(
      sortByDue([task({ dueDate: null }), task({ dueDate: '2026-11-02' })]).map((t) => t.dueDate),
      [null, '2026-11-02'],
    );
  });

  it('calcula los indicadores de la semana', () => {
    const s = computeWeekStats(tasks, tasks, { userId: null, today: '2026-11-05', team, capacityHours: 20 });
    assert.equal(s.totalPlan, 3);
    assert.equal(s.donePlan, 1);
    assert.equal(s.extraCount, 1);
    assert.equal(s.extraRealSeconds, 8 * 3600);
    assert.equal(s.planRealSeconds, (16 + 2 + 4 + 2.5) * 3600);
    assert.equal(s.planEstimateMinutes, (10 + 3 + 4 + 2) * 60);
    assert.equal(s.overdue, 2);
    assert.equal(s.exceeded, 0);
    assert.equal(s.teamSize, 2);
    assert.equal(s.extraSharePct, Math.round((8 / (8 + 24.5)) * 100));
    assert.equal(s.sprintProgress, Math.round((10 * 70 + 3 * 30 + 6 * 100) / 19));
  });

  it('filtra indicadores por persona sin cambiar la carga del equipo', () => {
    const vis = filterTasks(tasks, { userId: 'ye', query: '' });
    const s = computeWeekStats(vis, tasks, { userId: 'ye', today: '2026-11-05', team, capacityHours: 18 });
    assert.equal(s.planRealSeconds, (16 + 2.5) * 3600);
    assert.equal(s.exceeded, 1, 'Yerson suma 18.5 h > 18 h');
    assert.equal(computeWeekStats([], [], { userId: null, today: '2026-11-05', team: [], capacityHours: 40 }).extraSharePct, 0);
  });

  it('calcula la carga por persona y su estado frente a la capacidad', () => {
    const load = computeTeamLoad(tasks, team, 18);
    const ye = load.find((l) => l.user.id === 'ye');
    const ru = load.find((l) => l.user.id === 'ru');
    assert.equal(ye?.taskCount, 2);
    assert.equal(ye?.planSeconds, 18.5 * 3600);
    assert.equal(ye?.state, 'exceeded');
    assert.equal(ye?.deltaMinutes, 30);
    assert.equal(ru?.extraSeconds, 8 * 3600);
    assert.equal(ru?.realSeconds, 14 * 3600);
    assert.equal(ru?.estimateMinutes, 13 * 60);
    assert.equal(ru?.state, 'available');
    assert.equal(ru?.deltaMinutes, 4 * 60);
  });

  it('marca "al límite" desde el 90 % de la capacidad', () => {
    assert.equal(loadState(36 * 3600, 40).state, 'limit');
    assert.equal(loadState(35.9 * 3600, 40).state, 'available');
    assert.equal(loadState(40 * 3600, 40).state, 'limit');
    assert.equal(loadState(40 * 3600 + 1, 40).state, 'exceeded');
  });
});

describe('metadatos y usuarios', () => {
  it('obtiene iniciales y primer nombre', () => {
    assert.equal(initialsOf('Yerson'), 'YE');
    assert.equal(initialsOf('  Ana  María Pérez'), 'AM');
    assert.equal(initialsOf(''), '');
    assert.equal(firstNameOf('Rubén Díaz'), 'Rubén');
  });
  it('expone estados y prioridades del prototipo', () => {
    assert.equal(statusMeta('blocked').l, 'Bloqueada');
    assert.equal(priorityMeta('alta').c, '#D4134F');
    assert.throws(() => statusMeta('x' as never));
    assert.throws(() => priorityMeta('x' as never));
  });
});
