import type { AssigneeDTO, Priority, TaskDTO, TaskStatus, TaskType, TimeSource } from '../../shared/types.ts';
import { isUuid } from '../../shared/validation.ts';
import type { Database } from '../db/database.ts';

interface TaskRow {
  id: string;
  week_id: string;
  type: TaskType;
  name: string;
  description: string;
  project: string;
  requested_by: string;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  due_date: string | null;
  carried_from_week: string | null;
  moved_to_week: string | null;
  delay_by_task_id: string | null;
  delay_reason: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface AssigneeRow {
  task_id: string;
  user_id: string;
  estimate_minutes: number;
  real_seconds: number;
}

export interface TaskRecord extends TaskDTO {
  deletedAt: string | null;
}

function toTask(r: TaskRow, assignees: AssigneeDTO[]): TaskRecord {
  return {
    id: r.id,
    weekId: r.week_id,
    type: r.type,
    name: r.name,
    description: r.description,
    project: r.project,
    requestedBy: r.requested_by,
    status: r.status,
    priority: r.priority,
    progress: r.progress,
    dueDate: r.due_date,
    carriedFromWeek: r.carried_from_week,
    movedToWeek: r.moved_to_week,
    delayByTaskId: r.delay_by_task_id,
    delayReason: r.delay_reason,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    assignees,
  };
}

export function toTaskDTO(t: TaskRecord): TaskDTO {
  const { deletedAt: _d, ...dto } = t;
  return dto;
}

const ASSIGNEE_SQL = `
  SELECT a.task_id, a.user_id, a.estimate_minutes,
         COALESCE((SELECT sum(e.seconds) FROM time_entries e WHERE e.task_id = a.task_id AND e.user_id = a.user_id), 0) AS real_seconds
  FROM task_assignees a`;

const TASK_COLS = `id, week_id, type, name, description, project, requested_by, status, priority, progress, due_date,
  carried_from_week, moved_to_week, delay_by_task_id, delay_reason, created_by, created_at, updated_at, deleted_at`;

export interface NewTask {
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
  carriedFromTask: string | null;
  createdBy: string | null;
}

export type TaskChanges = Partial<{
  type: TaskType;
  name: string;
  description: string;
  project: string;
  requestedBy: string;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  dueDate: string | null;
  delayByTaskId: string | null;
  delayReason: string;
  movedToWeek: string | null;
}>;

const COLUMN: Record<keyof TaskChanges, string> = {
  type: 'type',
  name: 'name',
  description: 'description',
  project: 'project',
  requestedBy: 'requested_by',
  status: 'status',
  priority: 'priority',
  progress: 'progress',
  dueDate: 'due_date',
  delayByTaskId: 'delay_by_task_id',
  delayReason: 'delay_reason',
  movedToWeek: 'moved_to_week',
};

export class TasksRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async #assigneesFor(taskIds: string[]): Promise<Map<string, AssigneeDTO[]>> {
    const map = new Map<string, AssigneeDTO[]>();
    if (!taskIds.length) return map;
    const params: Record<string, string> = {};
    const names = taskIds.map((id, i) => {
      params[`t${i}`] = id;
      return `$t${i}`;
    });
    const rows = await this.#db.all<AssigneeRow>(`${ASSIGNEE_SQL} WHERE a.task_id IN (${names.join(',')}) ORDER BY a.seq`, params);
    for (const r of rows) {
      const list = map.get(r.task_id) ?? [];
      list.push({ userId: r.user_id, estimateMinutes: r.estimate_minutes, realSeconds: r.real_seconds });
      map.set(r.task_id, list);
    }
    return map;
  }

  async listByWeek(weekId: string): Promise<TaskRecord[]> {
    const rows = await this.#db.all<TaskRow>(`SELECT ${TASK_COLS} FROM tasks WHERE week_id = $weekId AND deleted_at IS NULL ORDER BY created_at, seq`, { weekId });
    const assignees = await this.#assigneesFor(rows.map((r) => r.id));
    return rows.map((r) => toTask(r, assignees.get(r.id) ?? []));
  }

  async findById(id: string, opts: { includeDeleted?: boolean } = {}): Promise<TaskRecord | undefined> {
    if (!isUuid(id)) return undefined;
    const r = await this.#db.get<TaskRow>(`SELECT ${TASK_COLS} FROM tasks WHERE id = $id ${opts.includeDeleted ? '' : 'AND deleted_at IS NULL'}`, { id });
    if (!r) return undefined;
    return toTask(r, (await this.#assigneesFor([r.id])).get(r.id) ?? []);
  }

  async insert(t: NewTask, now: string): Promise<void> {
    await this.#db.run(
      `INSERT INTO tasks (id, week_id, type, name, description, project, requested_by, status, priority, progress, due_date,
                          carried_from_week, carried_from_task, created_by, created_at, updated_at)
       VALUES ($id, $weekId, $type, $name, $description, $project, $requestedBy, $status, $priority, $progress, $dueDate,
               $carriedFromWeek, $carriedFromTask, $createdBy, $now, $now)`,
      { ...t, now },
    );
  }

  async update(id: string, c: TaskChanges, now: string): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, string | number | null> = { id, now };
    for (const [k, v] of Object.entries(c) as Array<[keyof TaskChanges, string | number | null | undefined]>) {
      if (v === undefined) continue;
      sets.push(`${COLUMN[k]} = $${k}`);
      params[k] = v;
    }
    sets.push('updated_at = $now');
    await this.#db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $id`, params);
  }

  async setDeleted(id: string, deletedAt: string | null, now: string): Promise<void> {
    await this.#db.run('UPDATE tasks SET deleted_at = $deletedAt, updated_at = $now WHERE id = $id', { id, deletedAt, now });
  }

  // ---------------------------------------------------------------- responsables y tiempo

  async getAssignee(taskId: string, userId: string): Promise<AssigneeDTO | undefined> {
    if (!isUuid(taskId) || !isUuid(userId)) return undefined;
    const r = await this.#db.get<AssigneeRow>(`${ASSIGNEE_SQL} WHERE a.task_id = $taskId AND a.user_id = $userId`, { taskId, userId });
    return r ? { userId: r.user_id, estimateMinutes: r.estimate_minutes, realSeconds: r.real_seconds } : undefined;
  }

  async insertAssignee(taskId: string, userId: string, estimateMinutes: number, now: string): Promise<void> {
    await this.#db.run('INSERT INTO task_assignees (task_id, user_id, estimate_minutes, created_at) VALUES ($taskId, $userId, $est, $now)', { taskId, userId, est: estimateMinutes, now });
  }

  async updateEstimate(taskId: string, userId: string, estimateMinutes: number): Promise<void> {
    await this.#db.run('UPDATE task_assignees SET estimate_minutes = $est WHERE task_id = $taskId AND user_id = $userId', { taskId, userId, est: estimateMinutes });
  }

  async deleteAssignee(taskId: string, userId: string): Promise<void> {
    await this.#db.run('DELETE FROM task_assignees WHERE task_id = $taskId AND user_id = $userId', { taskId, userId });
  }

  async addTime(e: { taskId: string; userId: string; seconds: number; source: TimeSource; createdBy: string | null }, now: string): Promise<void> {
    await this.#db.run('INSERT INTO time_entries (task_id, user_id, seconds, source, created_by, created_at) VALUES ($taskId, $userId, $seconds, $source, $createdBy, $now)', { ...e, now });
  }
}
