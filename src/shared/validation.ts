// Validación de entradas compartida por la interfaz (formularios) y la API.
import { LIMITS, PRIORITY_KEYS, ROLES, STATUS_KEYS, TASK_TYPES, VIEW_MODES } from './constants.ts';
import type { Priority, Role, TaskStatus, TaskType, ViewMode } from './types.ts';
import { isValidDate, isValidWeekId } from './weeks.ts';

export type FieldErrors = Record<string, string>;
/** Tipo de salida de un esquema. */
export type Infer<C extends (...args: never[]) => unknown> = Exclude<ReturnType<C>, undefined>;
export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

type Check<T> = (value: unknown, path: string, errors: FieldErrors) => T | undefined;
const OPTIONAL = Symbol('optional');
type OptionalCheck<T> = Check<T> & { [OPTIONAL]: true };

type Shape = Record<string, Check<unknown>>;
type Output<S extends Shape> = {
  [K in keyof S as S[K] extends OptionalCheck<unknown> ? never : K]: S[K] extends Check<infer T> ? T : never;
} & {
  [K in keyof S as S[K] extends OptionalCheck<unknown> ? K : never]?: S[K] extends Check<infer T> ? T : never;
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Elimina caracteres de control (excepto saltos de línea y tabulaciones). */
export function sanitizeText(s: string): string {
  return s.replace(CONTROL_CHARS, '');
}

export function text(opts: { min?: number; max: number; trim?: boolean; label?: string; multiline?: boolean }): Check<string> {
  return (v, path, errors) => {
    if (typeof v !== 'string') {
      errors[path] = 'Debe ser texto.';
      return undefined;
    }
    let s = sanitizeText(v);
    if (opts.trim !== false) s = s.trim();
    if (!opts.multiline) s = s.replace(/[\r\n\t]+/g, ' ');
    const min = opts.min ?? 0;
    if (s.length < min) {
      errors[path] = min === 1 ? `${opts.label ?? 'Este campo'} es obligatorio.` : `Debe tener al menos ${min} caracteres.`;
      return undefined;
    }
    if (s.length > opts.max) {
      errors[path] = `Máximo ${opts.max} caracteres.`;
      return undefined;
    }
    return s;
  };
}

export function integer(opts: { min: number; max: number; label?: string }): Check<number> {
  return (v, path, errors) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      errors[path] = 'Debe ser un número entero.';
      return undefined;
    }
    if (v < opts.min || v > opts.max) {
      errors[path] = `Debe estar entre ${opts.min} y ${opts.max}.`;
      return undefined;
    }
    return v;
  };
}

export function oneOf<T extends string>(values: readonly T[]): Check<T> {
  return (v, path, errors) => {
    if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
      errors[path] = 'Valor no permitido.';
      return undefined;
    }
    return v as T;
  };
}

export function bool(): Check<boolean> {
  return (v, path, errors) => {
    if (typeof v !== 'boolean') {
      errors[path] = 'Debe ser verdadero o falso.';
      return undefined;
    }
    return v;
  };
}

/** Fecha YYYY-MM-DD o null. */
export function dateOrNull(): Check<string | null> {
  return (v, path, errors) => {
    if (v === null || v === '') return null;
    if (typeof v !== 'string' || !isValidDate(v)) {
      errors[path] = 'Fecha inválida.';
      return undefined;
    }
    return v;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificadores de la base de datos (uuid de PostgreSQL). */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function idOrNull(): Check<string | null> {
  return (v, path, errors) => {
    if (v === null || v === '') return null;
    if (!isUuid(v)) {
      errors[path] = 'Identificador inválido.';
      return undefined;
    }
    return v;
  };
}

export function id(): Check<string> {
  return (v, path, errors) => {
    if (!isUuid(v)) {
      errors[path] = 'Identificador inválido.';
      return undefined;
    }
    return v;
  };
}

export function weekId(): Check<string> {
  return (v, path, errors) => {
    if (typeof v !== 'string' || !isValidWeekId(v)) {
      errors[path] = 'Semana inválida.';
      return undefined;
    }
    return v;
  };
}

export function email(): Check<string> {
  return (v, path, errors) => {
    const s = text({ min: 3, max: LIMITS.email })(v, path, errors);
    if (s === undefined) return undefined;
    const lower = s.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
      errors[path] = 'Correo electrónico inválido.';
      return undefined;
    }
    return lower;
  };
}

export function color(): Check<string> {
  return (v, path, errors) => {
    if (typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v)) {
      errors[path] = 'Color inválido (use #RRGGBB).';
      return undefined;
    }
    return v.toUpperCase();
  };
}

/** Reglas de contraseña: longitud mínima, al menos una letra y un número. */
export function passwordProblems(pw: string): string | null {
  if (pw.length < LIMITS.passwordMin) return `La contraseña debe tener al menos ${LIMITS.passwordMin} caracteres.`;
  if (pw.length > LIMITS.passwordMax) return `La contraseña admite máximo ${LIMITS.passwordMax} caracteres.`;
  if (!/[A-Za-zÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe incluir letras y números.';
  return null;
}

export function password(): Check<string> {
  return (v, path, errors) => {
    if (typeof v !== 'string') {
      errors[path] = 'Debe ser texto.';
      return undefined;
    }
    const p = passwordProblems(v);
    if (p) {
      errors[path] = p;
      return undefined;
    }
    return v;
  };
}

export function optional<T>(check: Check<T>): OptionalCheck<T> {
  const wrapped = ((v: unknown, path: string, errors: FieldErrors) => (v === undefined ? undefined : check(v, path, errors))) as OptionalCheck<T>;
  wrapped[OPTIONAL] = true;
  return wrapped;
}

export function arrayOf<T>(check: Check<T>, opts: { max: number }): Check<T[]> {
  return (v, path, errors) => {
    if (!Array.isArray(v)) {
      errors[path] = 'Debe ser una lista.';
      return undefined;
    }
    if (v.length > opts.max) {
      errors[path] = `Máximo ${opts.max} elementos.`;
      return undefined;
    }
    const out: T[] = [];
    let failed = false;
    v.forEach((item, i) => {
      const r = check(item, `${path}[${i}]`, errors);
      if (r === undefined) failed = true;
      else out.push(r);
    });
    return failed ? undefined : out;
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function object<S extends Shape>(shape: S, opts: { requireOne?: boolean } = {}): Check<Output<S>> & { parse: (input: unknown) => Result<Output<S>> } {
  const check = (v: unknown, path: string, errors: FieldErrors): Output<S> | undefined => {
    if (!isPlainObject(v)) {
      errors[path || '_'] = 'Se esperaba un objeto.';
      return undefined;
    }
    const out: Record<string, unknown> = {};
    const before = Object.keys(errors).length;
    for (const key of Object.keys(v)) {
      if (!(key in shape)) errors[path ? `${path}.${key}` : key] = 'Campo no permitido.';
    }
    for (const [key, fieldCheck] of Object.entries(shape)) {
      const isOpt = (fieldCheck as Partial<OptionalCheck<unknown>>)[OPTIONAL] === true;
      const raw = v[key];
      const p = path ? `${path}.${key}` : key;
      if (raw === undefined && !isOpt) {
        errors[p] = 'Campo obligatorio.';
        continue;
      }
      const r = fieldCheck(raw, p, errors);
      if (r !== undefined) out[key] = r;
    }
    if (opts.requireOne && Object.keys(out).length === 0 && Object.keys(errors).length === before) {
      errors[path || '_'] = 'No hay cambios que aplicar.';
    }
    return Object.keys(errors).length > before ? undefined : (out as Output<S>);
  };
  const parse = (input: unknown): Result<Output<S>> => {
    const errors: FieldErrors = {};
    const value = check(input, '', errors);
    return value === undefined ? { ok: false, errors } : { ok: true, value };
  };
  return Object.assign(check, { parse });
}

// ---------------------------------------------------------------- esquemas de la API

const taskType = oneOf<TaskType>(TASK_TYPES);
const taskStatus = oneOf<TaskStatus>(STATUS_KEYS);
const priority = oneOf<Priority>(PRIORITY_KEYS);
const progress = integer({ min: 0, max: 100 });
const estimate = integer({ min: 0, max: LIMITS.maxEstimateMinutes });

export const loginSchema = object({
  email: email(),
  password: text({ min: 1, max: LIMITS.passwordMax, trim: false, label: 'La contraseña' }),
});

export const createWeekSchema = object({
  weekId: weekId(),
  carry: bool(),
});

export const createTaskSchema = object({
  type: taskType,
  name: text({ min: 1, max: LIMITS.taskName, label: 'El nombre' }),
  description: optional(text({ max: LIMITS.description, multiline: true })),
  project: optional(text({ max: LIMITS.project })),
  requestedBy: optional(text({ max: LIMITS.requestedBy })),
  status: optional(taskStatus),
  priority: optional(priority),
  progress: optional(progress),
  dueDate: optional(dateOrNull()),
  assignees: optional(arrayOf(object({ userId: id(), estimateMinutes: estimate }), { max: 20 })),
});

export const updateTaskSchema = object(
  {
    type: optional(taskType),
    name: optional(text({ min: 1, max: LIMITS.taskName, label: 'El nombre' })),
    description: optional(text({ max: LIMITS.description, multiline: true })),
    project: optional(text({ max: LIMITS.project })),
    requestedBy: optional(text({ max: LIMITS.requestedBy })),
    status: optional(taskStatus),
    priority: optional(priority),
    progress: optional(progress),
    dueDate: optional(dateOrNull()),
    delayByTaskId: optional(idOrNull()),
    delayReason: optional(text({ max: LIMITS.delayReason, multiline: true })),
  },
  { requireOne: true },
);

export const upsertAssigneeSchema = object(
  {
    estimateMinutes: optional(estimate),
    realSeconds: optional(integer({ min: 0, max: LIMITS.maxRealSeconds })),
  },
  {},
);

export const addTimeSchema = object({
  userId: id(),
  minutes: integer({ min: 1, max: LIMITS.maxAddMinutes }),
  source: oneOf<'quick' | 'manual'>(['quick', 'manual']),
});

export const startTimerSchema = object({
  taskId: id(),
  userId: id(),
});

export const settingsSchema = object(
  {
    capacityHours: optional(integer({ min: LIMITS.capacityMin, max: LIMITS.capacityMax })),
    defaultView: optional(oneOf<ViewMode>(VIEW_MODES)),
  },
  { requireOne: true },
);

export const createUserSchema = object({
  email: email(),
  name: text({ min: 2, max: LIMITS.userName, label: 'El nombre' }),
  role: oneOf<Role>(ROLES),
  jobTitle: optional(text({ max: LIMITS.jobTitle })),
  color: optional(color()),
  inTeam: optional(bool()),
  password: password(),
});

export const updateUserSchema = object(
  {
    name: optional(text({ min: 2, max: LIMITS.userName, label: 'El nombre' })),
    role: optional(oneOf<Role>(ROLES)),
    jobTitle: optional(text({ max: LIMITS.jobTitle })),
    color: optional(color()),
    inTeam: optional(bool()),
    active: optional(bool()),
    password: optional(password()),
  },
  { requireOne: true },
);

export const changePasswordSchema = object({
  currentPassword: text({ min: 1, max: LIMITS.passwordMax, trim: false, label: 'La contraseña actual' }),
  newPassword: password(),
});
