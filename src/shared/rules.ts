// Reglas de negocio y cálculos puros (sin E/S). Usados por el servidor y por la interfaz.
import { DEFAULT_PROGRESS, STATUS_ORDER } from './constants.ts';
import type { AssigneeDTO, TaskDTO, TaskStatus, UserDTO } from './types.ts';

// ---------------------------------------------------------------- formato de tiempo

/** Formatea minutos como en el prototipo: "3h", "45m", "2h 15m", "0h". */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h}h`;
  return h ? `${h}h ${r}m` : `${r}m`;
}

export function formatSeconds(seconds: number): string {
  return formatMinutes(seconds / 60);
}

/** Divide minutos en [horas, minutos]. */
export function splitHM(totalMinutes: number): [number, number] {
  const m = Math.max(0, Math.round(totalMinutes));
  return [Math.floor(m / 60), m % 60];
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

export function formatQuickAdd(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
}

// ---------------------------------------------------------------- estado y avance

export interface StatusProgress {
  status: TaskStatus;
  progress: number;
}

/**
 * Aplica las reglas de consistencia entre estado y avance:
 * - Completar ⇒ avance 100 %.
 * - Salir de "Completada" ⇒ avance por defecto del nuevo estado.
 * - Avance 100 % ⇒ Completada; bajar de 100 % una completada ⇒ En curso.
 * - Avance > 0 sobre "Por hacer" ⇒ En curso.
 */
export function applyStatusProgressRules(current: StatusProgress, patch: Partial<StatusProgress>): StatusProgress {
  const { status, progress } = patch;
  if (status !== undefined && progress !== undefined) {
    if (status === 'done') return { status, progress: 100 };
    if (progress === 100) return { status: 'done', progress };
    return { status, progress };
  }
  if (status !== undefined) {
    if (status === 'done') return { status, progress: 100 };
    if (current.status === 'done') return { status, progress: DEFAULT_PROGRESS[status] };
    return { status, progress: current.progress };
  }
  if (progress !== undefined) {
    if (progress === 100) return { status: 'done', progress };
    if (current.status === 'done') return { status: 'doing', progress };
    if (progress > 0 && current.status === 'todo') return { status: 'doing', progress };
    return { status: current.status, progress };
  }
  return { ...current };
}

// ---------------------------------------------------------------- horas

export function estimateMinutes(task: Pick<TaskDTO, 'assignees'>, userId: string | null = null): number {
  return task.assignees.filter((a) => !userId || a.userId === userId).reduce((x, a) => x + a.estimateMinutes, 0);
}

export function realSeconds(task: Pick<TaskDTO, 'assignees'>, userId: string | null = null): number {
  return task.assignees.filter((a) => !userId || a.userId === userId).reduce((x, a) => x + a.realSeconds, 0);
}

/** Estimado de arrastre: lo que falta, con mínimo de 1 hora (regla del prototipo). */
export function carryEstimateMinutes(a: Pick<AssigneeDTO, 'estimateMinutes' | 'realSeconds'>): number {
  return Math.max(Math.round(a.estimateMinutes - a.realSeconds / 60), 60);
}

/** Horas que faltan para una tarea pendiente (mínimo 1 h). */
export function pendingLeftMinutes(task: Pick<TaskDTO, 'assignees'>): number {
  const left = task.assignees.reduce((x, a) => x + a.estimateMinutes - a.realSeconds / 60, 0);
  return Math.max(Math.round(left), 60);
}

/** Avance ponderado por el estimado de cada tarea (tareas sin estimado pesan 1 h). */
export function weightedProgress(tasks: ReadonlyArray<Pick<TaskDTO, 'assignees' | 'progress'>>): number {
  let w = 0;
  let acc = 0;
  for (const t of tasks) {
    const e = estimateMinutes(t) || 60;
    w += e;
    acc += e * t.progress;
  }
  return w ? Math.round(acc / w) : 0;
}

export function isOverdue(task: Pick<TaskDTO, 'status' | 'dueDate'>, today: string): boolean {
  return task.status !== 'done' && !!task.dueDate && task.dueDate < today;
}

/** Suma segundos del cronómetro en curso a la persona correspondiente. */
export function withLiveTimer(tasks: readonly TaskDTO[], timer: { taskId: string; userId: string } | null, elapsedSeconds: number): TaskDTO[] {
  if (!timer || elapsedSeconds <= 0) return tasks.slice();
  return tasks.map((t) =>
    t.id !== timer.taskId
      ? t
      : { ...t, assignees: t.assignees.map((a) => (a.userId === timer.userId ? { ...a, realSeconds: a.realSeconds + elapsedSeconds } : a)) },
  );
}

// ---------------------------------------------------------------- filtros y orden

export function filterTasks(tasks: readonly TaskDTO[], opts: { userId: string | null; query: string }): TaskDTO[] {
  const q = opts.query.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!opts.userId || t.assignees.some((a) => a.userId === opts.userId)) &&
      (!q || `${t.name} ${t.project} ${t.requestedBy}`.toLowerCase().includes(q)),
  );
}

export function sortForList(tasks: readonly TaskDTO[]): TaskDTO[] {
  return tasks.slice().sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
}

export function sortByDue(tasks: readonly TaskDTO[]): TaskDTO[] {
  return tasks.slice().sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
}

// ---------------------------------------------------------------- indicadores

export interface WeekStats {
  sprintProgress: number;
  donePlan: number;
  totalPlan: number;
  planRealSeconds: number;
  planEstimateMinutes: number;
  extraCount: number;
  extraRealSeconds: number;
  extraSharePct: number;
  overdue: number;
  exceeded: number;
  teamSize: number;
}

export function computeWeekStats(visible: readonly TaskDTO[], all: readonly TaskDTO[], opts: { userId: string | null; today: string; team: readonly UserDTO[]; capacityHours: number }): WeekStats {
  let planReal = 0;
  let extraReal = 0;
  let planEst = 0;
  let overdue = 0;
  for (const t of visible) {
    const r = realSeconds(t, opts.userId);
    if (t.type === 'plan') {
      planReal += r;
      planEst += estimateMinutes(t, opts.userId);
    } else {
      extraReal += r;
    }
    if (isOverdue(t, opts.today)) overdue++;
  }
  const plan = visible.filter((t) => t.type === 'plan');
  const load = computeTeamLoad(all, opts.team, opts.capacityHours);
  return {
    sprintProgress: weightedProgress(plan),
    donePlan: plan.filter((t) => t.status === 'done').length,
    totalPlan: plan.length,
    planRealSeconds: planReal,
    planEstimateMinutes: planEst,
    extraCount: visible.filter((t) => t.type === 'extra').length,
    extraRealSeconds: extraReal,
    extraSharePct: Math.round((extraReal / (planReal + extraReal || 1)) * 100),
    overdue,
    exceeded: load.filter((l) => l.state === 'exceeded').length,
    teamSize: opts.team.length,
  };
}

export type LoadState = 'exceeded' | 'limit' | 'available';

export interface PersonLoad {
  user: UserDTO;
  taskCount: number;
  planSeconds: number;
  extraSeconds: number;
  estimateMinutes: number;
  realSeconds: number;
  state: LoadState;
  /** Exceso (si "exceeded") o disponibilidad (si "available"), en minutos. */
  deltaMinutes: number;
}

export function loadState(realSecs: number, capacityHours: number): { state: LoadState; deltaMinutes: number } {
  const capSecs = capacityHours * 3600;
  if (realSecs > capSecs) return { state: 'exceeded', deltaMinutes: (realSecs - capSecs) / 60 };
  if (realSecs >= capSecs * 0.9) return { state: 'limit', deltaMinutes: 0 };
  return { state: 'available', deltaMinutes: (capSecs - realSecs) / 60 };
}

export function computeTeamLoad(tasks: readonly TaskDTO[], team: readonly UserDTO[], capacityHours: number): PersonLoad[] {
  return team.map((user) => {
    let plan = 0;
    let extra = 0;
    let est = 0;
    let n = 0;
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (a.userId !== user.id) continue;
        n++;
        est += a.estimateMinutes;
        if (t.type === 'plan') plan += a.realSeconds;
        else extra += a.realSeconds;
      }
    }
    const real = plan + extra;
    return { user, taskCount: n, planSeconds: plan, extraSeconds: extra, estimateMinutes: est, realSeconds: real, ...loadState(real, capacityHours) };
  });
}

// ---------------------------------------------------------------- usuarios

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const second = parts[1];
  if (second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  return first.slice(0, 2).toUpperCase();
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
