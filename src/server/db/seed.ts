// Datos semilla reproducibles basados en el prototipo original (semanas 44 y 45 de 2026).
// Las fechas se desplazan para que la "semana 45" del prototipo sea la semana actual.
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROGRESS } from '../../shared/constants.ts';
import type { Priority, TaskStatus, TaskType } from '../../shared/types.ts';
import { addDays, addWeeks, diffDays, mondayOf, parseWeekId, weekIdOf } from '../../shared/weeks.ts';
import type { ServiceContext } from '../services/context.ts';
import { hashPassword } from '../services/passwords.ts';

const PROTO_MONDAY = '2026-11-02';

export interface SeedOptions {
  adminPassword: string;
  memberPassword: string;
}

export const DEMO_USERS = {
  admin: { email: 'coordinacion@edulabs.test', name: 'Coordinación Edu Labs', color: '#4A4752' },
  ye: { email: 'yerson@edulabs.test', name: 'Yerson', color: '#5E1A8C' },
  ru: { email: 'ruben@edulabs.test', name: 'Rubén', color: '#1B8FCB' },
  wi: { email: 'wilson@edulabs.test', name: 'Wilson', color: '#E6195F' },
} as const;

type P = 'ye' | 'ru' | 'wi';

interface SeedTask {
  key?: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  prio: Priority;
  due: string;
  project: string;
  progress?: number;
  requestedBy?: string;
  carried?: boolean;
  moved?: boolean;
  delayBy?: string;
  delayReason?: string;
  a: Array<[P, number, number]>;
}

const W44: SeedTask[] = [
  { name: 'Guiones instruccionales Módulo 1 y 2 – Diplomado FUCS', type: 'plan', status: 'done', prio: 'alta', due: '2026-10-29', project: 'FUCS', a: [['ye', 16, 17]] },
  { name: 'Actualización plugin de reportes', type: 'plan', status: 'blocked', prio: 'alta', due: '2026-10-30', project: 'Externado', moved: true, a: [['ru', 10, 6]] },
  { name: 'Plantilla gráfica curso de inducción', type: 'plan', status: 'doing', prio: 'media', due: '2026-10-30', project: 'Heel', moved: true, a: [['wi', 14, 8]] },
  { name: 'Diseño de evaluación final Módulo 2', type: 'plan', status: 'todo', prio: 'media', due: '2026-10-30', project: 'FUCS', moved: true, a: [['ye', 6, 0], ['ru', 2, 0]] },
  { name: 'Animaciones de bienvenida', type: 'plan', status: 'done', prio: 'media', due: '2026-10-28', project: 'FUCS', a: [['ye', 12, 13]] },
  { name: 'Backups y monitoreo mensual', type: 'plan', status: 'done', prio: 'baja', due: '2026-10-27', project: 'Interno', a: [['wi', 6, 5]] },
  { name: 'Corrección de estilo guías de estudio', type: 'plan', status: 'done', prio: 'media', due: '2026-10-29', project: 'Externado', a: [['ru', 10, 9]] },
  { name: 'Atención incidencia de matrículas masivas', type: 'extra', status: 'done', prio: 'alta', due: '2026-10-28', project: 'UAPR', requestedBy: 'Cliente UAPR', a: [['wi', 4, 7], ['ru', 3, 6]] },
  { name: 'Demo comercial para nuevo cliente', type: 'extra', status: 'done', prio: 'alta', due: '2026-10-29', project: 'Comercial', requestedBy: 'Gerencia comercial', a: [['wi', 4, 6], ['ye', 3, 4]] },
];

const W45: SeedTask[] = [
  { name: 'Guion instruccional Módulo 3 – Diplomado FUCS', type: 'plan', status: 'doing', progress: 70, prio: 'alta', due: '2026-11-05', project: 'FUCS', a: [['ye', 10, 16]] },
  { name: 'Montaje de curso de inducción corporativa en Moodle', type: 'plan', status: 'doing', progress: 60, prio: 'alta', due: '2026-11-06', project: 'One Link', a: [['ru', 12, 16]] },
  { name: 'Banco de infografías Unidad 2', type: 'plan', status: 'review', prio: 'media', due: '2026-11-04', project: 'Externado', a: [['wi', 8, 9.5]] },
  { name: 'Videos animados – Introducción al curso', type: 'plan', status: 'doing', progress: 40, prio: 'media', due: '2026-11-06', project: 'FUCS', a: [['ye', 14, 11]] },
  { name: 'Corrección de estilo guiones M1–M2', type: 'plan', status: 'done', prio: 'media', due: '2026-11-03', project: 'FUCS', a: [['ru', 6, 6]] },
  { name: 'Actualización plugin de reportes', type: 'plan', status: 'blocked', prio: 'alta', due: '2026-10-30', project: 'Externado', carried: true, delayBy: 'outage', delayReason: 'Se priorizó la caída del servidor del martes.', a: [['ru', 4, 3]] },
  { name: 'Plantilla gráfica curso de inducción', type: 'plan', status: 'doing', prio: 'media', due: '2026-11-04', progress: 80, project: 'Heel', carried: true, a: [['wi', 6, 7]] },
  { name: 'Migración de usuarios campus virtual', type: 'plan', status: 'doing', progress: 70, prio: 'media', due: '2026-11-05', project: 'UAPR', a: [['wi', 8, 6]] },
  { name: 'Diseño de evaluación final Módulo 2', type: 'plan', status: 'todo', prio: 'media', due: '2026-11-06', progress: 20, project: 'FUCS', carried: true, a: [['ye', 6, 4], ['ru', 2, 0]] },
  { name: 'Paquetes SCORM módulos 1 y 2', type: 'plan', status: 'done', prio: 'media', due: '2026-11-04', project: 'FUCS', a: [['ru', 4, 4], ['ye', 2, 2.5]] },
  { name: 'Storyboard Módulo 4', type: 'plan', status: 'doing', progress: 30, prio: 'baja', due: '2026-11-06', project: 'FUCS', a: [['ye', 8, 11]] },
  { name: 'Capacitación docentes Moodle (sesión 1)', type: 'plan', status: 'done', prio: 'media', due: '2026-11-03', project: 'UAPR', a: [['wi', 4, 4]] },
  { key: 'outage', name: 'Caída de servidor campus Externado – soporte urgente', type: 'extra', status: 'done', prio: 'alta', due: '2026-11-03', project: 'Externado', requestedBy: 'Cliente Externado', a: [['ru', 3, 8], ['wi', 3, 5]] },
  { name: 'Ajustes de último minuto a propuesta comercial', type: 'extra', status: 'done', prio: 'alta', due: '2026-11-04', project: 'Comercial', requestedBy: 'Gerencia comercial', a: [['wi', 4, 5], ['ye', 2, 3]] },
  { name: 'Reunión extraordinaria con cliente FUCS', type: 'extra', status: 'done', prio: 'media', due: '2026-11-04', project: 'FUCS', requestedBy: 'Dirección de proyectos', a: [['ye', 2, 2], ['ru', 2, 2]] },
  { name: 'Corrección de errores reportados en curso Heel', type: 'extra', status: 'doing', progress: 60, prio: 'alta', due: '2026-11-05', project: 'Heel', requestedBy: 'Cliente Heel', a: [['ye', 3, 4], ['ru', 2, 3.5]] },
  { name: 'Integración SSO con Office 365', type: 'extra', status: 'review', prio: 'alta', due: '2026-11-05', project: 'One Link', requestedBy: 'Cliente One Link', a: [['ru', 6, 8]] },
  { name: 'Reportes de notas para cierre de semestre', type: 'extra', status: 'doing', prio: 'media', due: '2026-11-06', project: 'UAPR', requestedBy: 'Cliente UAPR', a: [['wi', 6, 7]] },
  { name: 'Edición de video testimonial para redes', type: 'extra', status: 'review', prio: 'baja', due: '2026-11-05', project: 'Mercadeo', requestedBy: 'Mercadeo', a: [['ye', 4, 3]] },
];

/** Escala las horas reales para que cada persona sume el total del prototipo (misma lógica que el original). */
export function normalizeHours(tasks: SeedTask[], target: Record<P, number>): SeedTask[] {
  const tot: Record<string, number> = {};
  tasks.forEach((t) => t.a.forEach(([p, , real]) => (tot[p] = (tot[p] ?? 0) + real)));
  return tasks.map((t) => ({
    ...t,
    a: t.a.map(([p, est, real]): [P, number, number] => {
      const f = tot[p] ? target[p] / (tot[p] ?? 1) : 1;
      return [p, Math.max(0.5, Math.round(est * f * 4) / 4), Math.round(real * f * 4) / 4];
    }),
  }));
}

export async function isDatabaseEmpty(ctx: ServiceContext): Promise<boolean> {
  return (await ctx.users.count()) === 0;
}

/** Inserta usuarios, ajustes y dos semanas de ejemplo. Requiere base de datos vacía. */
export async function seedDemo(ctx: ServiceContext, opts: SeedOptions): Promise<{ currentWeekId: string; previousWeekId: string }> {
  if (!(await isDatabaseEmpty(ctx))) throw new Error('La base de datos ya tiene datos. Use --reset para reiniciarla.');
  const current = weekIdOf(ctx.today());
  const previous = addWeeks(current, -1);
  const offset = diffDays(mondayOf(current), PROTO_MONDAY);
  const shift = (d: string): string => addDays(d, offset);
  const adminHash = await hashPassword(opts.adminPassword);
  const memberHash = await hashPassword(opts.memberPassword);
  const ids: Record<'admin' | P, string> = { admin: randomUUID(), ye: randomUUID(), ru: randomUUID(), wi: randomUUID() };
  const now = ctx.nowIso();

  await ctx.db.transaction(async () => {
    await ctx.users.insert({ id: ids.admin, ...DEMO_USERS.admin, role: 'admin', jobTitle: 'Coordinación', inTeam: false, passwordHash: adminHash }, now);
    for (const p of ['ye', 'ru', 'wi'] as const) {
      await ctx.users.insert({ id: ids[p], ...DEMO_USERS[p], role: 'member', jobTitle: 'Colaborador', inTeam: true, passwordHash: memberHash }, now);
    }
    await ctx.settings.set('capacityHours', '40', now);
    await ctx.settings.set('defaultView', 'lista', now);

    for (const weekId of [previous, current]) {
      const { year, week } = parseWeekId(weekId);
      await ctx.weeks.insert({ id: weekId, isoYear: year, isoWeek: week, monday: mondayOf(weekId), createdBy: ids.admin }, now);
    }
    for (const [weekId, list] of [
      [previous, normalizeHours(W44, { ye: 39, ru: 41, wi: 37 })],
      [current, normalizeHours(W45, { ye: 44.5, ru: 37, wi: 31 })],
    ] as const) {
      const keyed = new Map<string, string>();
      const created: Array<{ id: string; t: SeedTask }> = [];
      for (const t of list) {
        const id = randomUUID();
        if (t.key) keyed.set(t.key, id);
        const progress = t.status === 'done' ? 100 : (t.progress ?? DEFAULT_PROGRESS[t.status]);
        await ctx.tasks.insert(
          {
            id,
            weekId,
            type: t.type,
            name: t.name,
            description: '',
            project: t.project,
            requestedBy: t.requestedBy ?? '',
            status: t.status,
            priority: t.prio,
            progress,
            dueDate: shift(t.due),
            carriedFromWeek: t.carried ? previous : null,
            carriedFromTask: null,
            createdBy: ids.admin,
          },
          now,
        );
        for (const [p, est, real] of t.a) {
          await ctx.tasks.insertAssignee(id, ids[p], Math.round(est * 60), now);
          if (real > 0) await ctx.tasks.addTime({ taskId: id, userId: ids[p], seconds: Math.round(real * 3600), source: 'seed', createdBy: ids.admin }, now);
        }
        created.push({ id, t });
      }
      for (const { id, t } of created) {
        const changes: { movedToWeek?: string; delayByTaskId?: string; delayReason?: string } = {};
        if (t.moved) changes.movedToWeek = current;
        if (t.delayBy) changes.delayByTaskId = keyed.get(t.delayBy) ?? '';
        if (t.delayReason) changes.delayReason = t.delayReason;
        if (Object.keys(changes).length) await ctx.tasks.update(id, changes, now);
      }
    }
    await ctx.record({ userId: null, action: 'seed.demo', entity: 'system', entityId: null, details: { previous, current } });
  });
  return { currentWeekId: current, previousWeekId: previous };
}
