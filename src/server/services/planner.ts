import { randomUUID } from 'node:crypto';
import { DEFAULT_PROGRESS } from '../../shared/constants.ts';
import { applyStatusProgressRules, carryEstimateMinutes, pendingLeftMinutes } from '../../shared/rules.ts';
import type { TaskDTO, TaskStatus, TimerDTO, WeekResponse } from '../../shared/types.ts';
import type { createTaskSchema, Infer, updateTaskSchema } from '../../shared/validation.ts';
import { addWeeks, compareWeekIds, mondayOf, parseWeekId, weekIdOf } from '../../shared/weeks.ts';
import { conflict, forbidden, notFound, unprocessable, validationError } from '../http/errors.ts';
import { type TaskChanges, type TaskRecord, toTaskDTO } from '../repositories/tasks.ts';
import { type Actor, isAdmin, type ServiceContext } from './context.ts';

type CreateTaskInput = Infer<typeof createTaskSchema>;
type UpdateTaskInput = Infer<typeof updateTaskSchema>;

// =============================================================== semanas

export class WeeksService {
  readonly #ctx: ServiceContext;
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx;
  }

  currentWeekId(): string {
    return weekIdOf(this.#ctx.today());
  }

  listIds(): Promise<string[]> {
    return this.#ctx.weeks.listIds();
  }

  names(): Promise<Record<string, string>> {
    return this.#ctx.weeks.names();
  }

  /** Cambia el nombre visible del sprint. Solo Coordinación. */
  async renameWeek(weekId: string, name: string, actor: Actor): Promise<WeekResponse> {
    if (!isAdmin(actor)) throw forbidden('Solo Coordinación puede cambiar el nombre del sprint.');
    parseWeekId(weekId);
    const ctx = this.#ctx;
    await ctx.db.transaction(async () => {
      const before = await ctx.weeks.get(weekId);
      if (!before) throw notFound('La semana aún no tiene tablero.');
      await ctx.weeks.rename(weekId, name);
      await ctx.record({ userId: actor.user.id, action: 'week.rename', entity: 'week', entityId: weekId, details: { from: before.name, to: name }, ip: actor.ip });
    });
    return this.getWeek(weekId, actor);
  }

  /** Regla: se crea la semana siguiente a la última existente, o la semana actual si es posterior. */
  async creationRule(weekId: string): Promise<{ allowed: boolean; reason: string }> {
    if (await this.#ctx.weeks.get(weekId)) return { allowed: false, reason: 'La semana ya tiene tablero.' };
    const latest = await this.#ctx.weeks.latest();
    const current = this.currentWeekId();
    if (!latest) return weekId === current ? { allowed: true, reason: '' } : { allowed: false, reason: 'El primer tablero debe ser el de la semana actual.' };
    if (weekId === addWeeks(latest.id, 1)) return { allowed: true, reason: '' };
    if (weekId === current && compareWeekIds(current, latest.id) > 0) return { allowed: true, reason: '' };
    return { allowed: false, reason: 'Solo se puede crear el tablero de la semana siguiente a la última o el de la semana actual.' };
  }

  async getWeek(weekId: string, actor: Actor): Promise<WeekResponse> {
    parseWeekId(weekId);
    const week = (await this.#ctx.weeks.get(weekId)) ?? null;
    if (week) {
      return { weekId, exists: true, week, tasks: (await this.#ctx.tasks.listByWeek(weekId)).map(toTaskDTO), previous: null, canCreate: false };
    }
    const prev = await this.#ctx.weeks.latestBefore(mondayOf(weekId));
    const pending = prev
      ? (await this.#ctx.tasks.listByWeek(prev.id)).filter((t) => t.status !== 'done').map((t) => ({ id: t.id, name: t.name, status: t.status, leftMinutes: pendingLeftMinutes(t) }))
      : [];
    return {
      weekId,
      exists: false,
      week: null,
      tasks: [],
      previous: prev ? { weekId: prev.id, pending } : null,
      canCreate: isAdmin(actor) && (await this.creationRule(weekId)).allowed,
    };
  }

  /** Crea el tablero; con carry=true trae las tareas no completadas de la semana anterior. */
  async createWeek(weekId: string, carry: boolean, actor: Actor): Promise<WeekResponse> {
    if (!isAdmin(actor)) throw forbidden('Solo Coordinación puede crear el tablero de la semana.');
    const ctx = this.#ctx;
    const { year, week } = parseWeekId(weekId);
    const monday = mondayOf(weekId);
    const now = ctx.nowIso();
    await ctx.db.transaction(async () => {
      // Serializa la creación de semanas para que dos coordinadores no creen la misma a la vez.
      await ctx.db.lockForTransaction(727_274_002);
      const rule = await this.creationRule(weekId);
      if (!rule.allowed) throw (await ctx.weeks.get(weekId)) ? conflict(rule.reason) : unprocessable(rule.reason);
      await ctx.weeks.insert({ id: weekId, isoYear: year, isoWeek: week, monday, createdBy: actor.user.id }, now);
      const prev = carry ? await ctx.weeks.latestBefore(monday) : undefined;
      let carried = 0;
      if (prev) {
        for (const t of (await ctx.tasks.listByWeek(prev.id)).filter((x) => x.status !== 'done')) {
          const id = randomUUID();
          await ctx.tasks.insert(
            {
              id,
              weekId,
              type: 'plan',
              name: t.name,
              description: t.description,
              project: t.project,
              requestedBy: t.requestedBy,
              status: t.status,
              priority: t.priority,
              progress: t.progress,
              dueDate: t.dueDate,
              carriedFromWeek: prev.id,
              carriedFromTask: t.id,
              createdBy: actor.user.id,
            },
            now,
          );
          for (const a of t.assignees) await ctx.tasks.insertAssignee(id, a.userId, carryEstimateMinutes(a), now);
          await ctx.tasks.update(t.id, { movedToWeek: weekId }, now);
          carried++;
        }
      }
      await ctx.record({ userId: actor.user.id, action: 'week.create', entity: 'week', entityId: weekId, details: { carry, carried, from: prev?.id ?? null }, ip: actor.ip });
    });
    return this.getWeek(weekId, actor);
  }
}

// =============================================================== tareas

export interface StoppedTimer {
  taskId: string;
  userId: string;
  seconds: number;
  capped: boolean;
  task: TaskDTO;
}

export class TasksService {
  readonly #ctx: ServiceContext;
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx;
  }

  async #get(id: string, includeDeleted = false): Promise<TaskRecord> {
    const t = await this.#ctx.tasks.findById(id, { includeDeleted });
    if (!t) throw notFound('La tarea no existe o fue eliminada.');
    return t;
  }

  async #dto(id: string): Promise<TaskDTO> {
    return toTaskDTO(await this.#get(id));
  }

  async #assertAssignable(userId: string): Promise<void> {
    const u = await this.#ctx.users.findById(userId);
    if (!u || !u.active) throw validationError({ userId: 'La persona no existe o está inactiva.' });
  }

  #assertCanLogTimeFor(actor: Actor, userId: string): void {
    if (!isAdmin(actor) && actor.user.id !== userId) throw forbidden('Solo puedes registrar tu propio tiempo.');
  }

  #assertCanDelete(actor: Actor, t: TaskRecord): void {
    if (!isAdmin(actor) && t.createdBy !== actor.user.id) throw forbidden('Solo quien creó la tarea o Coordinación pueden eliminarla.');
  }

  async create(weekId: string, input: CreateTaskInput, actor: Actor): Promise<TaskDTO> {
    const ctx = this.#ctx;
    if (!(await ctx.weeks.get(weekId))) throw notFound('La semana aún no tiene tablero.');
    const status: TaskStatus = input.status ?? 'todo';
    const sp = applyStatusProgressRules({ status, progress: input.progress ?? DEFAULT_PROGRESS[status] }, {});
    const fixed = sp.status === 'done' || sp.progress === 100 ? { status: 'done' as const, progress: 100 } : sp;
    const assignees = input.assignees ?? [];
    if (new Set(assignees.map((a) => a.userId)).size !== assignees.length) throw validationError({ assignees: 'Hay responsables repetidos.' });
    for (const a of assignees) await this.#assertAssignable(a.userId);
    const id = randomUUID();
    const now = ctx.nowIso();
    await ctx.db.transaction(async () => {
      await ctx.tasks.insert(
        {
          id,
          weekId,
          type: input.type,
          name: input.name,
          description: input.description ?? '',
          project: input.project ?? '',
          requestedBy: input.type === 'extra' ? (input.requestedBy ?? '') : '',
          status: fixed.status,
          priority: input.priority ?? 'media',
          progress: fixed.progress,
          dueDate: input.dueDate ?? null,
          carriedFromWeek: null,
          carriedFromTask: null,
          createdBy: actor.user.id,
        },
        now,
      );
      for (const a of assignees) await ctx.tasks.insertAssignee(id, a.userId, a.estimateMinutes, now);
      await ctx.record({ userId: actor.user.id, action: 'task.create', entity: 'task', entityId: id, details: { weekId, type: input.type, name: input.name }, ip: actor.ip });
    });
    return this.#dto(id);
  }

  async update(id: string, input: UpdateTaskInput, actor: Actor): Promise<TaskDTO> {
    const ctx = this.#ctx;
    const t = await this.#get(id);
    const changes: TaskChanges = { ...input };
    if (input.status !== undefined || input.progress !== undefined) {
      const patch: { status?: TaskStatus; progress?: number } = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.progress !== undefined) patch.progress = input.progress;
      const sp = applyStatusProgressRules({ status: t.status, progress: t.progress }, patch);
      changes.status = sp.status;
      changes.progress = sp.progress;
    }
    if (input.delayByTaskId) {
      if (input.delayByTaskId === id) throw validationError({ delayByTaskId: 'Una tarea no puede justificar su propio retraso.' });
      const ref = await ctx.tasks.findById(input.delayByTaskId);
      if (!ref || ref.weekId !== t.weekId || ref.type !== 'extra') throw validationError({ delayByTaskId: 'Selecciona una tarea adicional de la misma semana.' });
    }
    await ctx.db.transaction(async () => {
      await ctx.tasks.update(id, changes, ctx.nowIso());
      const fields = Object.keys(input);
      await ctx.record({ userId: actor.user.id, action: 'task.update', entity: 'task', entityId: id, details: { fields, ...(changes.status && changes.status !== t.status ? { status: [t.status, changes.status] } : {}) }, ip: actor.ip });
    });
    return this.#dto(id);
  }

  async delete(id: string, actor: Actor): Promise<void> {
    const ctx = this.#ctx;
    const t = await this.#get(id);
    this.#assertCanDelete(actor, t);
    await ctx.db.transaction(async () => {
      await ctx.timers.deleteByTask(id);
      await ctx.tasks.setDeleted(id, ctx.nowIso(), ctx.nowIso());
      await ctx.record({ userId: actor.user.id, action: 'task.delete', entity: 'task', entityId: id, details: { name: t.name }, ip: actor.ip });
    });
  }

  async restore(id: string, actor: Actor): Promise<TaskDTO> {
    const ctx = this.#ctx;
    const t = await this.#get(id, true);
    if (!t.deletedAt) throw conflict('La tarea no está eliminada.');
    this.#assertCanDelete(actor, t);
    await ctx.db.transaction(async () => {
      await ctx.tasks.setDeleted(id, null, ctx.nowIso());
      await ctx.record({ userId: actor.user.id, action: 'task.restore', entity: 'task', entityId: id, ip: actor.ip });
    });
    return this.#dto(id);
  }

  /** Agrega o actualiza un responsable. realSeconds fija el total real (crea un ajuste). */
  async upsertAssignee(taskId: string, userId: string, input: { estimateMinutes?: number; realSeconds?: number }, actor: Actor): Promise<TaskDTO> {
    const ctx = this.#ctx;
    await this.#get(taskId);
    await this.#assertAssignable(userId);
    if (input.realSeconds !== undefined) this.#assertCanLogTimeFor(actor, userId);
    const now = ctx.nowIso();
    await ctx.db.transaction(async () => {
      const existing = await ctx.tasks.getAssignee(taskId, userId);
      if (!existing) await ctx.tasks.insertAssignee(taskId, userId, input.estimateMinutes ?? 60, now);
      else if (input.estimateMinutes !== undefined) await ctx.tasks.updateEstimate(taskId, userId, input.estimateMinutes);
      if (input.realSeconds !== undefined) {
        const delta = input.realSeconds - (existing?.realSeconds ?? 0);
        if (delta !== 0) await ctx.tasks.addTime({ taskId, userId, seconds: delta, source: 'adjust', createdBy: actor.user.id }, now);
      }
      await ctx.tasks.update(taskId, {}, now);
      await ctx.record({ userId: actor.user.id, action: existing ? 'assignee.update' : 'assignee.add', entity: 'task', entityId: taskId, details: { userId, ...input }, ip: actor.ip });
    });
    return this.#dto(taskId);
  }

  async removeAssignee(taskId: string, userId: string, actor: Actor): Promise<TaskDTO> {
    const ctx = this.#ctx;
    await this.#get(taskId);
    const a = await ctx.tasks.getAssignee(taskId, userId);
    if (!a) throw notFound('La persona no es responsable de esta tarea.');
    if (a.realSeconds > 0) this.#assertCanLogTimeFor(actor, userId);
    await ctx.db.transaction(async () => {
      await ctx.tasks.deleteAssignee(taskId, userId);
      await ctx.record({ userId: actor.user.id, action: 'assignee.remove', entity: 'task', entityId: taskId, details: { userId, estimateMinutes: a.estimateMinutes, realSeconds: a.realSeconds }, ip: actor.ip });
    });
    return this.#dto(taskId);
  }

  async addTime(taskId: string, input: { userId: string; minutes: number; source: 'quick' | 'manual' }, actor: Actor): Promise<TaskDTO> {
    const ctx = this.#ctx;
    await this.#get(taskId);
    this.#assertCanLogTimeFor(actor, input.userId);
    if (!(await ctx.tasks.getAssignee(taskId, input.userId))) throw validationError({ userId: 'La persona no es responsable de esta tarea.' });
    await ctx.db.transaction(async () => {
      await ctx.tasks.addTime({ taskId, userId: input.userId, seconds: input.minutes * 60, source: input.source, createdBy: actor.user.id }, ctx.nowIso());
      await ctx.record({ userId: actor.user.id, action: 'time.add', entity: 'task', entityId: taskId, details: { userId: input.userId, minutes: input.minutes, source: input.source }, ip: actor.ip });
    });
    return this.#dto(taskId);
  }

  // ------------------------------------------------------------- cronómetro

  async getTimer(actor: Actor): Promise<TimerDTO | null> {
    const tm = await this.#ctx.timers.getByOwner(actor.user.id);
    if (!tm) return null;
    const t = await this.#ctx.tasks.findById(tm.taskId);
    if (!t) return null;
    return { taskId: tm.taskId, userId: tm.userId, weekId: t.weekId, taskName: t.name, startedAt: tm.startedAt };
  }

  async startTimer(taskId: string, userId: string, actor: Actor): Promise<{ timer: TimerDTO; stopped: StoppedTimer | null; task: TaskDTO }> {
    const ctx = this.#ctx;
    const t = await this.#get(taskId);
    this.#assertCanLogTimeFor(actor, userId);
    if (!t.assignees.some((a) => a.userId === userId)) throw validationError({ userId: 'Asigna a la persona antes de cronometrar.' });
    const other = await ctx.timers.getByAssignment(taskId, userId);
    if (other && other.ownerId !== actor.user.id) throw conflict('Ya hay un cronómetro activo para esta persona en esta tarea.');
    const stopped = await ctx.db.transaction(async () => {
      const prev = (await ctx.timers.getByOwner(actor.user.id)) ? await this.stopTimer(actor) : null;
      await ctx.timers.insert({ ownerId: actor.user.id, taskId, userId, startedAt: ctx.nowIso() });
      if (t.status === 'todo') await ctx.tasks.update(taskId, applyStatusProgressRules(t, { status: 'doing' }), ctx.nowIso());
      await ctx.record({ userId: actor.user.id, action: 'timer.start', entity: 'task', entityId: taskId, details: { userId }, ip: actor.ip });
      return prev;
    });
    const timer = await this.getTimer(actor);
    if (!timer) throw new Error('No se pudo iniciar el cronómetro.');
    return { timer, stopped, task: await this.#dto(taskId) };
  }

  async stopTimer(actor: Actor): Promise<StoppedTimer> {
    const ctx = this.#ctx;
    const tm = await ctx.timers.getByOwner(actor.user.id);
    if (!tm) throw conflict('No hay un cronómetro activo.');
    const elapsed = Math.floor((ctx.clock.now().getTime() - new Date(tm.startedAt).getTime()) / 1000);
    const capped = elapsed > ctx.config.timerMaxSeconds;
    const seconds = Math.max(1, Math.min(elapsed, ctx.config.timerMaxSeconds));
    await ctx.db.transaction(async () => {
      await ctx.timers.deleteByOwner(actor.user.id);
      await ctx.tasks.addTime({ taskId: tm.taskId, userId: tm.userId, seconds, source: 'timer', createdBy: actor.user.id }, ctx.nowIso());
      await ctx.tasks.update(tm.taskId, {}, ctx.nowIso());
      await ctx.record({ userId: actor.user.id, action: 'timer.stop', entity: 'task', entityId: tm.taskId, details: { userId: tm.userId, seconds, capped }, ip: actor.ip });
    });
    return { taskId: tm.taskId, userId: tm.userId, seconds, capped, task: await this.#dto(tm.taskId) };
  }
}
