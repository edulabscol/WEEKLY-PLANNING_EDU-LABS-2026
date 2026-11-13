import type { Priority, Role, TaskStatus, TaskType, ViewMode } from './types.ts';

export interface StatusMeta {
  k: TaskStatus;
  l: string;
  c: string;
  bg: string;
  t: string;
}

/** Estados con la paleta original del prototipo. */
export const STATUSES: readonly StatusMeta[] = [
  { k: 'todo', l: 'Por hacer', c: '#8A8A8F', bg: '#EFEEF2', t: '#4A4752' },
  { k: 'doing', l: 'En curso', c: '#22A7E8', bg: '#E1F3FC', t: '#0B6A99' },
  { k: 'review', l: 'En revisión', c: '#FFC20E', bg: '#FFF3CF', t: '#7A5A00' },
  { k: 'blocked', l: 'Bloqueada', c: '#E6195F', bg: '#FDE4ED', t: '#A10F43' },
  { k: 'done', l: 'Completada', c: '#7DBA1F', bg: '#ECF6DE', t: '#47740A' },
];

export const STATUS_KEYS: readonly TaskStatus[] = STATUSES.map((s) => s.k);

export function statusMeta(k: TaskStatus): StatusMeta {
  const found = STATUSES.find((s) => s.k === k);
  if (!found) throw new Error(`Estado desconocido: ${k}`);
  return found;
}

export interface PriorityMeta {
  k: Priority;
  l: string;
  c: string;
}

export const PRIORITIES: readonly PriorityMeta[] = [
  { k: 'alta', l: 'Alta', c: '#D4134F' },
  { k: 'media', l: 'Media', c: '#B88300' },
  { k: 'baja', l: 'Baja', c: '#6B6B73' },
];

export const PRIORITY_KEYS: readonly Priority[] = PRIORITIES.map((p) => p.k);

export function priorityMeta(k: Priority): PriorityMeta {
  const found = PRIORITIES.find((p) => p.k === k);
  if (!found) throw new Error(`Prioridad desconocida: ${k}`);
  return found;
}

export const TASK_TYPES: readonly TaskType[] = ['plan', 'extra'];
export const ROLES: readonly Role[] = ['admin', 'member'];
export const VIEW_MODES: readonly ViewMode[] = ['lista', 'tablero', 'carga'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Coordinación',
  member: 'Colaborador',
};

/** Avance por defecto al cambiar de estado (regla del prototipo). */
export const DEFAULT_PROGRESS: Record<TaskStatus, number> = {
  todo: 0,
  doing: 50,
  review: 90,
  blocked: 30,
  done: 100,
};

/** Orden de las filas en la vista de lista. */
export const STATUS_ORDER: Record<TaskStatus, number> = {
  blocked: 0,
  doing: 1,
  review: 2,
  todo: 3,
  done: 4,
};

export const LIMITS = {
  taskName: 200,
  description: 5000,
  project: 120,
  requestedBy: 120,
  delayReason: 1000,
  userName: 80,
  jobTitle: 60,
  email: 160,
  passwordMin: 10,
  passwordMax: 128,
  /** Estimado máximo por persona y tarea (minutos). */
  maxEstimateMinutes: 200 * 60,
  /** Tiempo real máximo registrable por persona y tarea (segundos). */
  maxRealSeconds: 200 * 3600,
  /** Máximo de minutos que se pueden sumar de una vez. */
  maxAddMinutes: 24 * 60,
  capacityMin: 20,
  capacityMax: 60,
} as const;

export const QUICK_ADD_MINUTES: readonly number[] = [15, 30, 60, 120];

export const PROGRESS_OPTIONS: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export const AVATAR_COLORS: readonly string[] = ['#5E1A8C', '#1B8FCB', '#E6195F', '#47740A', '#B88300', '#0B6A99', '#A10F43', '#4A4752'];
