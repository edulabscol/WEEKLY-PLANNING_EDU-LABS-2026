import type {
  AuditEntryDTO,
  BootstrapDTO,
  Page,
  SettingsDTO,
  TaskDTO,
  TaskStatus,
  TimerDTO,
  UserDTO,
  WeekResponse,
} from '../../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let csrfToken = '';
let onUnauthorized: () => void = () => undefined;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown, opts: { silent401?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? null : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'network_error', 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    if (res.status === 401 && !opts.silent401) onUnauthorized();
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Error ${res.status}`, err?.fields ?? {});
  }
  return data as T;
}

export interface CreateTaskBody {
  type: 'plan' | 'extra';
  name: string;
  description?: string;
  project?: string;
  requestedBy?: string;
  status?: TaskStatus;
  priority?: 'alta' | 'media' | 'baja';
  progress?: number;
  dueDate?: string | null;
  assignees?: Array<{ userId: string; estimateMinutes: number }>;
}

export type TaskPatch = Partial<
  Pick<TaskDTO, 'type' | 'name' | 'description' | 'project' | 'requestedBy' | 'status' | 'priority' | 'progress' | 'dueDate' | 'delayByTaskId' | 'delayReason'>
>;

export interface StoppedTimer {
  taskId: string;
  userId: string;
  seconds: number;
  capped: boolean;
  task: TaskDTO;
}

const enc = encodeURIComponent;

export const api = {
  session: () => request<{ authenticated: boolean }>('GET', '/api/auth/session', undefined, { silent401: true }),
  bootstrap: () => request<BootstrapDTO>('GET', '/api/bootstrap', undefined, { silent401: true }),
  login: (email: string, password: string) => request<{ user: UserDTO; csrfToken: string }>('POST', '/api/auth/login', { email, password }, { silent401: true }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) => request<void>('POST', '/api/auth/password', { currentPassword, newPassword }),

  week: (weekId: string) => request<WeekResponse>('GET', `/api/weeks/${enc(weekId)}`),
  createWeek: (weekId: string, carry: boolean) => request<WeekResponse>('POST', '/api/weeks', { weekId, carry }),

  createTask: (weekId: string, body: CreateTaskBody) => request<TaskDTO>('POST', `/api/weeks/${enc(weekId)}/tasks`, body),
  updateTask: (id: string, patch: TaskPatch) => request<TaskDTO>('PATCH', `/api/tasks/${enc(id)}`, patch),
  deleteTask: (id: string) => request<void>('DELETE', `/api/tasks/${enc(id)}`),
  restoreTask: (id: string) => request<TaskDTO>('POST', `/api/tasks/${enc(id)}/restore`),
  upsertAssignee: (id: string, userId: string, body: { estimateMinutes?: number; realSeconds?: number }) =>
    request<TaskDTO>('PUT', `/api/tasks/${enc(id)}/assignees/${enc(userId)}`, body),
  removeAssignee: (id: string, userId: string) => request<TaskDTO>('DELETE', `/api/tasks/${enc(id)}/assignees/${enc(userId)}`),
  addTime: (id: string, userId: string, minutes: number) => request<TaskDTO>('POST', `/api/tasks/${enc(id)}/time`, { userId, minutes, source: 'quick' }),

  startTimer: (taskId: string, userId: string) => request<{ timer: TimerDTO; stopped: StoppedTimer | null; task: TaskDTO }>('POST', '/api/timer/start', { taskId, userId }),
  stopTimer: () => request<StoppedTimer>('POST', '/api/timer/stop'),

  updateSettings: (body: Partial<SettingsDTO>) => request<SettingsDTO>('PUT', '/api/settings', body),
  users: () => request<{ users: UserDTO[] }>('GET', '/api/users'),
  createUser: (body: { email: string; name: string; role: 'admin' | 'member'; jobTitle?: string; inTeam?: boolean; password: string }) => request<UserDTO>('POST', '/api/users', body),
  updateUser: (id: string, body: Partial<{ name: string; role: 'admin' | 'member'; jobTitle: string; inTeam: boolean; active: boolean; password: string }>) =>
    request<UserDTO>('PATCH', `/api/users/${enc(id)}`, body),
  audit: (limit: number, offset: number) => request<Page<AuditEntryDTO>>('GET', `/api/audit?limit=${limit}&offset=${offset}`),
};
