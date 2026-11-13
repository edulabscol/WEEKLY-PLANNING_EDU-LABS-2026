// Tipos de dominio compartidos entre cliente y servidor.

export type TaskStatus = 'todo' | 'doing' | 'review' | 'blocked' | 'done';
export type Priority = 'alta' | 'media' | 'baja';
export type TaskType = 'plan' | 'extra';
export type Role = 'admin' | 'member';
export type ViewMode = 'lista' | 'tablero' | 'carga';
export type TimeSource = 'timer' | 'quick' | 'manual' | 'adjust' | 'seed';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  firstName: string;
  initials: string;
  color: string;
  role: Role;
  jobTitle: string;
  inTeam: boolean;
  active: boolean;
}

export interface AssigneeDTO {
  userId: string;
  estimateMinutes: number;
  realSeconds: number;
}

export interface TaskDTO {
  id: string;
  weekId: string;
  type: TaskType;
  name: string;
  description: string;
  project: string;
  requestedBy: string;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  dueDate: string | null;
  carriedFromWeek: string | null;
  movedToWeek: string | null;
  delayByTaskId: string | null;
  delayReason: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: AssigneeDTO[];
}

export interface WeekDTO {
  id: string;
  isoYear: number;
  isoWeek: number;
  monday: string;
  createdAt: string;
}

export interface PendingTaskDTO {
  id: string;
  name: string;
  status: TaskStatus;
  leftMinutes: number;
}

export interface WeekResponse {
  weekId: string;
  exists: boolean;
  week: WeekDTO | null;
  tasks: TaskDTO[];
  previous: { weekId: string; pending: PendingTaskDTO[] } | null;
  canCreate: boolean;
}

export interface TimerDTO {
  taskId: string;
  userId: string;
  weekId: string;
  taskName: string;
  startedAt: string;
}

export interface SettingsDTO {
  capacityHours: number;
  defaultView: ViewMode;
}

export interface BootstrapDTO {
  user: UserDTO;
  csrfToken: string;
  today: string;
  serverNow: string;
  currentWeekId: string;
  settings: SettingsDTO;
  team: UserDTO[];
  weeks: string[];
  timer: TimerDTO | null;
}

export interface AuditEntryDTO {
  id: number;
  userId: string | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
