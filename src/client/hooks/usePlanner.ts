import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PROGRESS, statusMeta } from '../../shared/constants.ts';
import { applyStatusProgressRules, formatQuickAdd, withLiveTimer } from '../../shared/rules.ts';
import type { BootstrapDTO, Priority, SettingsDTO, TaskDTO, TaskStatus, TaskType, TimerDTO, UserDTO, ViewMode, WeekResponse } from '../../shared/types.ts';
import { addDays, addWeeks, compareWeekIds, mondayOf } from '../../shared/weeks.ts';
import { api, ApiError, type TaskPatch } from '../lib/api.ts';
import { sprintLabel } from '../lib/sprints.ts';

export const DRAFT_ID = '__draft__';

export interface ToastState {
  id: number;
  msg: string;
  kind: 'info' | 'error';
  undo?: () => void;
}

type DraftField = 'name' | 'description' | 'project' | 'requestedBy' | 'status' | 'priority' | 'progress' | 'dueDate' | 'type' | 'delayByTaskId' | 'delayReason';
const DRAFT_FIELDS: DraftField[] = ['name', 'description', 'project', 'requestedBy', 'status', 'priority', 'progress', 'dueDate', 'type', 'delayByTaskId', 'delayReason'];

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const first = Object.values(e.fields)[0];
    return first ? `${e.message} ${first}` : e.message;
  }
  return 'Ocurrió un error inesperado.';
}

export function usePlanner(boot: BootstrapDTO) {
  const me = boot.user;
  const isAdmin = me.role === 'admin';
  const [weekId, setWeekId] = useState(boot.currentWeekId);
  const [weekIds, setWeekIds] = useState<string[]>(boot.weeks);
  const [weekNames, setWeekNames] = useState<Record<string, string>>(boot.weekNames ?? {});
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [settings, setSettings] = useState<SettingsDTO>(boot.settings);
  const [team, setTeam] = useState<UserDTO[]>(boot.team);
  const [timer, setTimer] = useState<TimerDTO | null>(boot.timer);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saved, setSaved] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const [draft, setDraft] = useState<TaskDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewMode | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<TaskType, boolean>>({ plan: false, extra: false });

  const clockOffset = useMemo(() => Date.parse(boot.serverNow) - Date.now(), [boot.serverNow]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<TaskDTO | null>(null);
  draftRef.current = draft;
  const creating = useRef(false);
  const weekIdRef = useRef(weekId);
  weekIdRef.current = weekId;

  // ------------------------------------------------------------ utilidades de UI
  const showToast = useCallback((msg: string, opts: { undo?: () => void; kind?: 'info' | 'error' } = {}) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const t: ToastState = { id: Date.now(), msg, kind: opts.kind ?? 'info' };
    if (opts.undo) t.undo = opts.undo;
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), opts.kind === 'error' ? 7000 : 5000);
  }, []);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  }, []);

  const fail = useCallback((e: unknown) => showToast(errorMessage(e), { kind: 'error' }), [showToast]);

  // ------------------------------------------------------------ carga de semana
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .week(weekId)
      .then((w) => {
        if (!cancelled) setWeek(w);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekId, reloadKey]);

  // Refresca al volver a la pestaña (cambios de otras personas), si no hay edición abierta.
  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState !== 'visible' || openId) return;
      api
        .week(weekIdRef.current)
        .then((w) => setWeek((cur) => (cur && cur.weekId === w.weekId ? w : cur)))
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [openId]);

  const upsertLocal = useCallback((t: TaskDTO) => {
    setWeek((w) => {
      if (!w || w.weekId !== t.weekId) return w;
      const exists = w.tasks.some((x) => x.id === t.id);
      return { ...w, tasks: exists ? w.tasks.map((x) => (x.id === t.id ? t : x)) : [...w.tasks, t] };
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setWeek((w) => (w ? { ...w, tasks: w.tasks.filter((x) => x.id !== id) } : w));
  }, []);

  const tasks = week?.tasks ?? [];
  const findTask = useCallback((id: string) => week?.tasks.find((t) => t.id === id), [week]);

  // ------------------------------------------------------------ navegación
  const currentWeekId = boot.currentWeekId;
  const minWeek = weekIds[0] ?? currentWeekId;
  const lastWeek = weekIds[weekIds.length - 1];
  const maxWeek = lastWeek && compareWeekIds(addWeeks(lastWeek, 1), currentWeekId) > 0 ? addWeeks(lastWeek, 1) : currentWeekId;
  const canPrev = compareWeekIds(weekId, minWeek) > 0;
  const canNext = compareWeekIds(weekId, maxWeek) < 0;

  const goWeek = useCallback(
    (delta: number) => {
      const next = addWeeks(weekId, delta);
      if (compareWeekIds(next, minWeek) < 0 || compareWeekIds(next, maxWeek) > 0) return;
      setOpenId(null);
      setDraft(null);
      setWeekId(next);
    },
    [weekId, minWeek, maxWeek],
  );

  const goToday = useCallback(() => {
    setOpenId(null);
    setDraft(null);
    setWeekId(currentWeekId);
  }, [currentWeekId]);

  // ------------------------------------------------------------ sprints
  const sprintName = useCallback((id: string) => sprintLabel(id, weekNames, weekIds), [weekNames, weekIds]);

  const renameWeek = useCallback(
    async (name: string): Promise<boolean> => {
      const clean = name.trim();
      const id = weekId;
      if (!clean || clean === weekNames[id]) return true;
      try {
        const w = await api.renameWeek(id, clean);
        const saved = w.week?.name ?? clean;
        setWeekNames((m) => ({ ...m, [id]: saved }));
        setWeek((cur) => (cur && cur.weekId === w.weekId ? w : cur));
        showToast(`Sprint renombrado: ${saved}`);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [weekId, weekNames, showToast, fail],
  );

  // ------------------------------------------------------------ semana
  const createWeek = useCallback(
    async (carry: boolean) => {
      setBusy(true);
      try {
        const w = await api.createWeek(weekId, carry);
        setWeek(w);
        setWeekIds((ids) => [...ids, w.weekId].sort((a, b) => compareWeekIds(a, b)));
        if (w.week) setWeekNames((m) => ({ ...m, [w.weekId]: w.week?.name ?? '' }));
        const n = w.tasks.length;
        showToast(carry && n ? `Tablero creado con ${n} tareas pendientes` : 'Tablero creado');
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [weekId, showToast, fail],
  );

  // ------------------------------------------------------------ tareas
  const patchTask = useCallback(
    async (task: TaskDTO, patch: TaskPatch, opts: { optimistic?: boolean } = {}): Promise<TaskDTO | null> => {
      if (task.id === DRAFT_ID) {
        setDraft((d) => (d ? { ...d, ...patch, ...(patch.status !== undefined || patch.progress !== undefined ? applyStatusProgressRules(d, patch) : {}) } : d));
        return null;
      }
      if (opts.optimistic !== false) {
        const sp = patch.status !== undefined || patch.progress !== undefined ? applyStatusProgressRules(task, patch) : {};
        upsertLocal({ ...task, ...patch, ...sp });
      }
      try {
        const t = await api.updateTask(task.id, patch);
        upsertLocal(t);
        flashSaved();
        return t;
      } catch (e) {
        const fresh = await api.week(task.weekId).catch(() => null);
        if (fresh) setWeek((w) => (w && w.weekId === fresh.weekId ? fresh : w));
        fail(e);
        return null;
      }
    },
    [upsertLocal, flashSaved, fail],
  );

  const setStatus = useCallback(
    async (task: TaskDTO, status: TaskStatus) => {
      if (task.status === status) return;
      const prev = { status: task.status, progress: task.progress };
      const t = await patchTask(task, { status });
      if (t) showToast(`Estado: ${statusMeta(status).l}`, { undo: () => void patchTask(t, prev) });
    },
    [patchTask, showToast],
  );

  const setProgress = useCallback(
    async (task: TaskDTO, progress: number) => {
      const prev = { status: task.status, progress: task.progress };
      const t = await patchTask(task, { progress });
      if (t && t.status === 'done' && prev.status !== 'done') showToast('Avance 100%: tarea completada', { undo: () => void patchTask(t, prev) });
    },
    [patchTask, showToast],
  );

  const quickAdd = useCallback(
    async (type: TaskType, name: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      try {
        const t = await api.createTask(weekId, {
          type,
          name: trimmed,
          dueDate: addDays(mondayOf(weekId), 4),
          assignees: filter ? [{ userId: filter, estimateMinutes: 60 }] : [],
        });
        upsertLocal(t);
        showToast('Tarea agregada. Ábrela para asignar y estimar.');
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [weekId, filter, upsertLocal, showToast, fail],
  );

  const openTask = useCallback((id: string) => {
    setDraft(null);
    setOpenId(id);
    setDrawerKey((k) => k + 1);
  }, []);

  const newTask = useCallback(
    (type: TaskType) => {
      if (!week?.exists) return;
      const now = new Date().toISOString();
      const status: TaskStatus = 'todo';
      setDraft({
        id: DRAFT_ID,
        weekId,
        type,
        name: '',
        description: '',
        project: '',
        requestedBy: '',
        status,
        priority: 'media' as Priority,
        progress: DEFAULT_PROGRESS[status],
        dueDate: addDays(mondayOf(weekId), 4),
        carriedFromWeek: null,
        movedToWeek: null,
        delayByTaskId: null,
        delayReason: '',
        createdBy: me.id,
        createdAt: now,
        updatedAt: now,
        assignees: filter ? [{ userId: filter, estimateMinutes: 60, realSeconds: 0 }] : [],
      });
      setOpenId(DRAFT_ID);
      setDrawerKey((k) => k + 1);
      setCollapsed((c) => ({ ...c, [type]: false }));
    },
    [week, weekId, filter, me.id],
  );

  /** Guarda el borrador en el servidor (cuando ya tiene nombre). */
  const commitDraft = useCallback(async (): Promise<TaskDTO | null> => {
    const d = draftRef.current;
    if (!d || !d.name.trim() || creating.current) return null;
    creating.current = true;
    setBusy(true);
    try {
      const t = await api.createTask(d.weekId, {
        type: d.type,
        name: d.name.trim(),
        description: d.description,
        project: d.project,
        requestedBy: d.requestedBy,
        status: d.status,
        priority: d.priority,
        progress: d.progress,
        dueDate: d.dueDate,
        assignees: d.assignees.map((a) => ({ userId: a.userId, estimateMinutes: a.estimateMinutes })),
      });
      // Cambios hechos mientras se guardaba.
      const latest = draftRef.current;
      const pending: TaskPatch = {};
      if (latest) {
        for (const f of DRAFT_FIELDS) {
          if (latest[f] !== d[f] && !(f === 'name' && latest.name.trim() === t.name)) (pending as Record<string, unknown>)[f] = f === 'name' ? latest.name.trim() || t.name : latest[f];
        }
      }
      upsertLocal(t);
      setDraft(null);
      setOpenId((cur) => (cur === DRAFT_ID ? t.id : cur));
      flashSaved();
      if (Object.keys(pending).length) await patchTask(t, pending, { optimistic: false });
      return t;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }, [upsertLocal, flashSaved, patchTask, fail]);

  const closeDrawer = useCallback(() => {
    const d = draftRef.current;
    if (d && openId === DRAFT_ID) {
      setDraft(null);
      setOpenId(null);
      if (!d.name.trim()) showToast('Se descartó la tarea sin nombre');
      return;
    }
    setOpenId(null);
  }, [openId, showToast]);

  const deleteTask = useCallback(
    async (task: TaskDTO) => {
      if (task.id === DRAFT_ID) {
        setDraft(null);
        setOpenId(null);
        return;
      }
      try {
        await api.deleteTask(task.id);
        removeLocal(task.id);
        setOpenId(null);
        if (timer?.taskId === task.id) setTimer(null);
        showToast(`Tarea eliminada: ${task.name || 'Sin título'}`, {
          undo: () => {
            api
              .restoreTask(task.id)
              .then((t) => {
                upsertLocal(t);
                setToast(null);
              })
              .catch(fail);
          },
        });
      } catch (e) {
        fail(e);
      }
    },
    [timer, removeLocal, upsertLocal, showToast, fail],
  );

  // ------------------------------------------------------------ responsables y tiempo
  const canLogFor = useCallback((userId: string) => isAdmin || userId === me.id, [isAdmin, me.id]);

  const assign = useCallback(
    async (task: TaskDTO, userId: string, body: { estimateMinutes?: number; realSeconds?: number }): Promise<TaskDTO | null> => {
      if (task.id === DRAFT_ID) {
        setDraft((d) => {
          if (!d) return d;
          const exists = d.assignees.some((a) => a.userId === userId);
          const assignees = exists
            ? d.assignees.map((a) => (a.userId === userId ? { ...a, estimateMinutes: body.estimateMinutes ?? a.estimateMinutes } : a))
            : [...d.assignees, { userId, estimateMinutes: body.estimateMinutes ?? 60, realSeconds: 0 }];
          return { ...d, assignees };
        });
        return null;
      }
      try {
        const t = await api.upsertAssignee(task.id, userId, body);
        upsertLocal(t);
        flashSaved();
        return t;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [upsertLocal, flashSaved, fail],
  );

  const unassign = useCallback(
    async (task: TaskDTO, userId: string) => {
      const person = team.find((u) => u.id === userId);
      if (task.id === DRAFT_ID) {
        setDraft((d) => (d ? { ...d, assignees: d.assignees.filter((a) => a.userId !== userId) } : d));
        return;
      }
      const prev = task.assignees.find((a) => a.userId === userId);
      try {
        const t = await api.removeAssignee(task.id, userId);
        upsertLocal(t);
        if (timer && timer.taskId === task.id && timer.userId === userId) setTimer(null);
        flashSaved();
        showToast(`${person?.firstName ?? 'La persona'} ya no es responsable`, {
          undo: prev
            ? () => {
                const body: { estimateMinutes: number; realSeconds?: number } = { estimateMinutes: prev.estimateMinutes };
                if (prev.realSeconds > 0) body.realSeconds = prev.realSeconds;
                void assign(t, userId, body).then(() => setToast(null));
              }
            : undefined,
        });
      } catch (e) {
        fail(e);
      }
    },
    [team, timer, upsertLocal, flashSaved, showToast, assign, fail],
  );

  const addQuickTime = useCallback(
    async (task: TaskDTO, userId: string, minutes: number) => {
      const prev = task.assignees.find((a) => a.userId === userId);
      try {
        const t = await api.addTime(task.id, userId, minutes);
        upsertLocal(t);
        flashSaved();
        const person = team.find((u) => u.id === userId);
        showToast(`Se sumaron ${formatQuickAdd(minutes)} a ${person?.firstName ?? ''}`.trim(), {
          undo: prev ? () => void assign(t, userId, { realSeconds: prev.realSeconds }).then(() => setToast(null)) : undefined,
        });
      } catch (e) {
        fail(e);
      }
    },
    [team, upsertLocal, flashSaved, showToast, assign, fail],
  );

  // ------------------------------------------------------------ cronómetro
  const timerElapsed = timer ? Math.max(0, Math.floor((Date.now() + clockOffset - Date.parse(timer.startedAt)) / 1000)) : 0;

  const stopTimer = useCallback(async () => {
    try {
      const r = await api.stopTimer();
      setTimer(null);
      upsertLocal(r.task);
      const person = team.find((u) => u.id === r.userId);
      const m = Math.max(1, Math.round(r.seconds / 60));
      showToast(`Se registraron ${m} min a ${person?.firstName ?? 'la persona'}${r.capped ? ' (se aplicó el máximo permitido)' : ''}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setTimer(null);
      fail(e);
    }
  }, [team, upsertLocal, showToast, fail]);

  const startTimer = useCallback(
    async (task: TaskDTO, userId: string) => {
      try {
        const r = await api.startTimer(task.id, userId);
        if (r.stopped) upsertLocal(r.stopped.task);
        upsertLocal(r.task);
        setTimer(r.timer);
      } catch (e) {
        fail(e);
      }
    },
    [upsertLocal, fail],
  );

  const rowTimer = useCallback(
    (task: TaskDTO) => {
      if (timer && timer.taskId === task.id) {
        void stopTimer();
        return;
      }
      if (!task.assignees.length) {
        openTask(task.id);
        showToast('Asigna un responsable para registrar tiempo');
        return;
      }
      const ids = task.assignees.map((a) => a.userId);
      const pick = (filter && ids.includes(filter) && canLogFor(filter) ? filter : null) ?? (ids.includes(me.id) ? me.id : null) ?? (isAdmin ? (ids[0] ?? null) : null);
      if (!pick) {
        showToast('Solo puedes cronometrar tu propio tiempo. Asígnate a la tarea para registrarlo.', { kind: 'error' });
        return;
      }
      void startTimer(task, pick);
    },
    [timer, filter, me.id, isAdmin, canLogFor, stopTimer, startTimer, openTask, showToast],
  );

  // ------------------------------------------------------------ datos derivados
  const liveTasks = useMemo(
    () => (timer && week && timer.weekId === week.weekId ? withLiveTimer(tasks, timer, timerElapsed) : tasks),
    [tasks, timer, week, timerElapsed],
  );
  const openTaskDTO = openId === DRAFT_ID ? draft : openId ? (liveTasks.find((t) => t.id === openId) ?? null) : null;

  const refreshMeta = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setSettings(b.settings);
      setTeam(b.team);
      setWeekIds(b.weeks);
      setWeekNames(b.weekNames ?? {});
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  return {
    me,
    isAdmin,
    today: boot.today,
    currentWeekId,
    weekId,
    week,
    loading,
    loadError,
    reload: () => setReloadKey((k) => k + 1),
    settings,
    setSettings,
    team,
    timer,
    timerElapsed,
    toast,
    dismissToast: () => setToast(null),
    showToast,
    saved,
    busy,
    view: view ?? settings.defaultView,
    setView,
    filter,
    setFilter,
    query,
    setQuery,
    collapsed,
    setCollapsed,
    canPrev,
    canNext,
    goWeek,
    goToday,
    createWeek,
    sprintName,
    renameWeek,
    liveTasks,
    findTask,
    openTask,
    openTaskDTO,
    drawerKey,
    isDraftOpen: openId === DRAFT_ID,
    newTask,
    commitDraft,
    closeDrawer,
    patchTask,
    setStatus,
    setProgress,
    quickAdd,
    deleteTask,
    assign,
    unassign,
    addQuickTime,
    canLogFor,
    rowTimer,
    startTimer,
    stopTimer,
    refreshMeta,
  };
}

export type Planner = ReturnType<typeof usePlanner>;
