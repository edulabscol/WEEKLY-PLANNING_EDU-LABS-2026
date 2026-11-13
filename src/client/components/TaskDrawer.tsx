import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { LIMITS, PRIORITIES, QUICK_ADD_MINUTES, STATUSES, statusMeta } from '../../shared/constants.ts';
import { estimateMinutes, formatMinutes, formatQuickAdd, formatSeconds, isOverdue, realSeconds, splitHM } from '../../shared/rules.ts';
import type { AssigneeDTO, TaskDTO, TaskStatus } from '../../shared/types.ts';
import { weekNumber } from '../../shared/weeks.ts';
import { DRAFT_ID, type Planner } from '../hooks/usePlanner.ts';
import { useDebouncedCallback } from '../lib/hooks.ts';
import { personFor } from '../lib/taskView.ts';
import { Avatar, C, inputStyle, LEXEND } from './ui.tsx';

type TextField = 'name' | 'project' | 'requestedBy' | 'description' | 'delayReason';

export function TaskDrawer({ p, task, width }: { p: Planner; task: TaskDTO; width: string }) {
  const isDraft = task.id === DRAFT_ID;
  const [text, setText] = useState<Record<TextField, string>>({ name: task.name, project: task.project, requestedBy: task.requestedBy, description: task.description, delayReason: task.delayReason });
  const [nameErr, setNameErr] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLTextAreaElement | null>(null);
  const taskRef = useRef(task);
  taskRef.current = task;

  const saveText = useDebouncedCallback((field: TextField, value: string) => {
    const t = taskRef.current;
    if (t.id === DRAFT_ID) return;
    if (field === 'name' && !value.trim()) return;
    const v = field === 'name' ? value.trim() : value;
    if (t[field] === v) return;
    void p.patchTask(t, { [field]: v }, { optimistic: false });
  }, 600);
  const commitDraft = useDebouncedCallback(() => void p.commitDraft(), 700);

  useEffect(() => {
    if (isDraft) nameRef.current?.focus();
    else panelRef.current?.focus();
    // Solo al abrir.
  }, []);

  const requestClose = async (): Promise<void> => {
    saveText.flush();
    commitDraft.cancel();
    if (taskRef.current.id === DRAFT_ID) {
      if (text.name.trim()) await p.commitDraft();
      p.closeDrawer();
      return;
    }
    if (!text.name.trim()) {
      setNameErr(true);
      nameRef.current?.focus();
      return;
    }
    p.closeDrawer();
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onText = (field: TextField, value: string): void => {
    setText((s) => ({ ...s, [field]: value }));
    if (field === 'name' && value.trim()) setNameErr(false);
    if (taskRef.current.id === DRAFT_ID) {
      void p.patchTask(taskRef.current, { [field]: field === 'name' ? value : value });
      if (field === 'name' && value.trim()) commitDraft.call();
      return;
    }
    saveText.call(field, value);
  };

  const st = statusMeta(task.status);
  const est = estimateMinutes(task);
  const real = realSeconds(task);
  const overdue = isOverdue(task, p.today);
  const canDelete = isDraft || p.isAdmin || task.createdBy === p.me.id;
  const showDelay = task.type === 'plan' && (overdue || !!task.carriedFromWeek || task.status === 'blocked' || !!task.delayByTaskId);
  const delayOpts = p.liveTasks.filter((t) => t.type === 'extra' && t.id !== task.id);
  const addable = p.team.filter((u) => !task.assignees.some((a) => a.userId === u.id));
  const label = { color: C.muted, fontWeight: 700 };

  return (
    <>
      <div onClick={() => void requestClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,36,.32)', zIndex: 40 }} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de tarea"
        tabIndex={-1}
        data-testid="task-drawer"
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width, maxWidth: '100%', background: '#fff', zIndex: 41, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(30,26,36,.18)', animation: 'elslide .2s ease', outline: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${C.line2}` }}>
          <div role="group" aria-label="Tipo de tarea" style={{ display: 'flex', gap: 4, background: C.soft, padding: 3, borderRadius: 10 }}>
            {(
              [
                ['plan', 'Planeada', C.purple],
                ['extra', 'Adicional', C.pink],
              ] as const
            ).map(([k, l, c]) => (
              <button
                key={k}
                aria-pressed={task.type === k}
                onClick={() => task.type !== k && void p.patchTask(task, { type: k })}
                style={{ border: 0, borderRadius: 8, padding: '6px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', background: task.type === k ? c : 'transparent', color: task.type === k ? '#fff' : C.ink2 }}
              >
                {l}
              </button>
            ))}
          </div>
          {task.carriedFromWeek && <span style={{ fontSize: 11, fontWeight: 800, color: '#7A5A00', background: '#FFF5D6', borderRadius: 6, padding: '3px 8px' }}>↻ Viene de Semana {weekNumber(task.carriedFromWeek)}</span>}
          <span style={{ flex: 1 }} />
          <span role="status" aria-live="polite" style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>
            {isDraft ? (p.busy ? 'Guardando…' : 'Borrador') : p.saved ? '✓ Guardado' : ''}
          </span>
          <button onClick={() => void requestClose()} aria-label="Cerrar (Esc)" title="Cerrar (Esc)" style={{ width: 36, height: 36, borderRadius: 10, border: 0, background: C.soft, fontSize: 18, cursor: 'pointer', color: C.ink2 }}>
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <textarea
            ref={nameRef}
            value={text.name}
            onChange={(e) => onText('name', e.target.value)}
            onBlur={() => saveText.flush()}
            placeholder="Nombre de la tarea"
            aria-label="Nombre de la tarea"
            aria-invalid={nameErr}
            aria-describedby={nameErr ? 'name-err' : undefined}
            maxLength={LIMITS.taskName}
            rows={2}
            style={{ width: '100%', border: 0, outline: 'none', resize: 'none', fontFamily: LEXEND, fontSize: 22, fontWeight: 600, lineHeight: 1.3, color: C.ink, padding: 0 }}
          />
          {nameErr && (
            <div id="name-err" role="alert" style={{ color: C.pinkDark, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
              Escribe un nombre para guardar la tarea.
            </div>
          )}
          {isDraft && !text.name.trim() && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>La tarea se guarda automáticamente cuando escribes el nombre.</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: '12px 14px', alignItems: 'center', marginTop: 18, fontSize: 13 }}>
            <label htmlFor="d-status" style={label}>
              Estado
            </label>
            <select id="d-status" value={task.status} onChange={(e) => void p.setStatus(task, e.target.value as TaskStatus)} style={{ ...inputStyle, fontWeight: 700, background: st.bg, color: st.t }}>
              {STATUSES.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.l}
                </option>
              ))}
            </select>

            <label htmlFor="d-progress" style={label}>
              Avance
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input id="d-progress" type="range" min={0} max={100} step={10} value={task.progress} onChange={(e) => void p.setProgress(task, Number(e.target.value))} style={{ flex: 1, accentColor: C.purple }} />
              <span data-testid="drawer-progress" style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 16, width: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: task.progress === 100 ? '#47740A' : C.purple }}>
                {task.progress}%
              </span>
            </div>

            <span style={label}>Prioridad</span>
            <div role="group" aria-label="Prioridad" style={{ display: 'flex', gap: 6 }}>
              {PRIORITIES.map((o) => {
                const on = task.priority === o.k;
                return (
                  <button
                    key={o.k}
                    aria-pressed={on}
                    onClick={() => !on && void p.patchTask(task, { priority: o.k })}
                    style={{ flex: 1, border: `1px solid ${on ? o.c : C.line}`, borderRadius: 9, padding: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer', background: on ? o.c : '#fff', color: on ? '#fff' : o.c }}
                  >
                    {o.l}
                  </button>
                );
              })}
            </div>

            <label htmlFor="d-due" style={label}>
              Vence
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input id="d-due" type="date" value={task.dueDate ?? ''} onChange={(e) => void p.patchTask(task, { dueDate: e.target.value || null })} style={{ ...inputStyle, flex: 1, padding: '8px 10px' }} />
              {overdue && <span style={{ fontSize: 12, fontWeight: 800, color: C.pinkDark }}>Vencida</span>}
            </div>

            <label htmlFor="d-project" style={label}>
              Proyecto
            </label>
            <input id="d-project" value={text.project} maxLength={LIMITS.project} onChange={(e) => onText('project', e.target.value)} onBlur={() => saveText.flush()} placeholder="Cliente o proyecto" style={inputStyle} />

            {task.type === 'extra' && (
              <>
                <label htmlFor="d-requested" style={label}>
                  Solicitado por
                </label>
                <input id="d-requested" value={text.requestedBy} maxLength={LIMITS.requestedBy} onChange={(e) => onText('requestedBy', e.target.value)} onBlur={() => saveText.flush()} placeholder="¿Quién pidió esta tarea?" style={inputStyle} />
              </>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 15, margin: 0 }}>Responsables y tiempo</h3>
              <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                Est. <b>{formatMinutes(est)}</b> · Real <b style={{ color: real / 60 > est && est > 0 ? C.overRed : C.ink }}>{formatSeconds(real)}</b>
              </span>
            </div>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, marginTop: 10, overflow: 'hidden' }}>
              {task.assignees.map((a, i) => (
                <AssigneeRow key={a.userId} p={p} task={task} a={a} first={i === 0} isDraft={isDraft} />
              ))}
              {!task.assignees.length && <div style={{ padding: 12, fontSize: 13, color: C.pinkDark }}>Asigna al menos una persona para estimar y registrar tiempo.</div>}
            </div>
            {addable.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {addable.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => void p.assign(task, u.id, { estimateMinutes: 60 })}
                    aria-label={`Agregar a ${u.name} como responsable`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px dashed #C9C3D2', background: '#fff', borderRadius: 999, padding: '3px 10px 3px 3px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.ink2 }}
                  >
                    <Avatar user={u} size={22} ring={false} decorative />+ {u.firstName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showDelay && (
            <div style={{ marginTop: 24, border: '1px solid #F6C9D8', background: '#FFF7FA', borderRadius: 12, padding: 14 }}>
              <h3 style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 15, color: C.pinkDark, margin: 0 }}>Justificación del retraso</h3>
              <div style={{ fontSize: 12, color: C.ink2, margin: '4px 0 10px' }}>Relaciona la tarea adicional que desplazó esta entrega.</div>
              <select aria-label="Tarea adicional que causó el retraso" value={task.delayByTaskId ?? ''} onChange={(e) => void p.patchTask(task, { delayByTaskId: e.target.value || null })} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Sin tarea relacionada</option>
                {delayOpts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <textarea
                aria-label="Nota sobre el retraso"
                value={text.delayReason}
                maxLength={LIMITS.delayReason}
                onChange={(e) => onText('delayReason', e.target.value)}
                onBlur={() => saveText.flush()}
                rows={2}
                placeholder="Nota breve (opcional)"
                style={{ ...inputStyle, width: '100%', marginTop: 8, resize: 'vertical' }}
              />
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <label htmlFor="d-desc" style={{ display: 'block', fontFamily: LEXEND, fontWeight: 600, fontSize: 15, marginBottom: 8, color: C.ink }}>
              Descripción
            </label>
            <textarea
              id="d-desc"
              value={text.description}
              maxLength={LIMITS.description}
              onChange={(e) => onText('description', e.target.value)}
              onBlur={() => saveText.flush()}
              rows={4}
              placeholder="Entregables, enlaces, criterios de aceptación…"
              style={{ ...inputStyle, width: '100%', padding: 10, lineHeight: 1.5, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: `1px solid ${C.line2}` }}>
          {canDelete && (
            <button onClick={() => void p.deleteTask(task)} style={{ border: 0, background: 'transparent', color: C.pinkDark, fontWeight: 700, cursor: 'pointer', padding: '10px 4px' }}>
              {isDraft ? 'Descartar' : 'Eliminar'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="hv-primary" onClick={() => void requestClose()} style={{ border: 0, background: C.purple, color: '#fff', borderRadius: 10, padding: '11px 22px', fontWeight: 700, cursor: 'pointer' }}>
            Listo
          </button>
        </div>
      </aside>
    </>
  );
}

function AssigneeRow({ p, task, a, first, isDraft }: { p: Planner; task: TaskDTO; a: AssigneeDTO; first: boolean; isDraft: boolean }) {
  const person = personFor(a.userId, p.team);
  const timerOn = !!p.timer && p.timer.taskId === task.id && p.timer.userId === a.userId;
  const canLog = p.canLogFor(a.userId) && !isDraft;
  const [estH, estM] = splitHM(a.estimateMinutes);
  const [realH, realM] = splitHM(a.realSeconds / 60);
  const [edit, setEdit] = useState<Partial<Record<'estH' | 'estM' | 'realH' | 'realM', string>>>({});
  const taskRef = useRef(task);
  taskRef.current = task;

  const commit = useDebouncedCallback((kind: 'est' | 'real', h: number, m: number) => {
    const total = Math.max(0, h) * 60 + Math.max(0, m);
    if (kind === 'est') void p.assign(taskRef.current, a.userId, { estimateMinutes: Math.min(total, LIMITS.maxEstimateMinutes) });
    else void p.assign(taskRef.current, a.userId, { realSeconds: Math.min(total * 60, LIMITS.maxRealSeconds) });
  }, 600);

  const num = (s: string | undefined, fallback: number): number => {
    if (s === undefined) return fallback;
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const onNum = (field: 'estH' | 'estM' | 'realH' | 'realM', value: string): void => {
    const next = { ...edit, [field]: value };
    setEdit(next);
    if (field.startsWith('est')) commit.call('est', num(next.estH, estH), num(next.estM, estM));
    else commit.call('real', num(next.realH, realH), num(next.realM, realM));
  };
  // Guarda al salir de los campos de esta persona (no al pasar de horas a minutos).
  const rowRef = useRef<HTMLDivElement | null>(null);
  const onBlur = (e: FocusEvent<HTMLInputElement>): void => {
    const next = e.relatedTarget as Node | null;
    if (next && rowRef.current?.contains(next)) return;
    commit.flush();
  };
  // Al llegar los valores guardados desde el servidor, se descarta la edición local correspondiente.
  useEffect(() => setEdit((s) => (s.estH === undefined && s.estM === undefined ? s : { realH: s.realH, realM: s.realM })), [a.estimateMinutes]);
  useEffect(() => setEdit((s) => (s.realH === undefined && s.realM === undefined ? s : { estH: s.estH, estM: s.estM })), [a.realSeconds]);
  const over = a.realSeconds / 60 > a.estimateMinutes;
  const numStyle = { width: 56, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 6px', fontSize: 14, fontVariantNumeric: 'tabular-nums' };
  const realDisabled = !canLog || timerOn;
  const realTitle = !canLog ? (isDraft ? 'Guarda la tarea para registrar tiempo' : 'Solo puedes registrar tu propio tiempo') : timerOn ? 'Detén el cronómetro para editar' : undefined;

  return (
    <div ref={rowRef} data-testid="assignee-row" data-user={person.firstName} style={{ padding: 12, borderTop: first ? undefined : `1px solid ${C.line2}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar user={person} size={28} ring={false} decorative />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.name}</span>
        <button
          onClick={() => (timerOn ? void p.stopTimer() : void p.startTimer(task, a.userId))}
          disabled={!canLog}
          aria-label={timerOn ? 'Detener cronómetro' : `Cronometrar a ${person.firstName}`}
          title={!canLog ? realTitle : timerOn ? 'Detener cronómetro' : `Cronometrar a ${person.firstName}`}
          style={{ width: 34, height: 34, borderRadius: '50%', border: 0, cursor: 'pointer', fontSize: 11, background: timerOn ? C.pink : '#F1E9F7', color: timerOn ? '#fff' : C.purple }}
        >
          {timerOn ? '■' : '▶'}
        </button>
        <button onClick={() => void p.unassign(task, a.userId)} aria-label={`Quitar a ${person.firstName} como responsable`} title="Quitar" style={{ border: 0, background: 'transparent', color: C.muted2, fontSize: 16, cursor: 'pointer', width: 28 }}>
          ×
        </button>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 11, fontWeight: 800, color: C.muted2, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4, padding: 0 }}>Estimado</legend>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
            <input type="number" min={0} max={200} inputMode="numeric" value={edit.estH ?? String(estH)} onChange={(e) => onNum('estH', e.target.value)} onBlur={onBlur} aria-label={`Estimado horas de ${person.firstName}`} style={numStyle} />
            <span>h</span>
            <input type="number" min={0} max={59} inputMode="numeric" value={edit.estM ?? String(estM)} onChange={(e) => onNum('estM', e.target.value)} onBlur={onBlur} aria-label={`Estimado minutos de ${person.firstName}`} style={numStyle} />
            <span>min</span>
          </div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} title={realTitle}>
          <legend style={{ fontSize: 11, fontWeight: 800, color: C.muted2, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4, padding: 0 }}>Real</legend>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
            <input type="number" min={0} inputMode="numeric" disabled={realDisabled} value={edit.realH ?? String(realH)} onChange={(e) => onNum('realH', e.target.value)} onBlur={onBlur} aria-label={`Real horas de ${person.firstName}`} style={{ ...numStyle, fontWeight: 700, color: over ? C.overRed : C.ink }} />
            <span>h</span>
            <input type="number" min={0} max={59} inputMode="numeric" disabled={realDisabled} value={edit.realM ?? String(realM)} onChange={(e) => onNum('realM', e.target.value)} onBlur={onBlur} aria-label={`Real minutos de ${person.firstName}`} style={{ ...numStyle, fontWeight: 700, color: over ? C.overRed : C.ink }} />
            <span>min</span>
          </div>
        </fieldset>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted, marginRight: 2 }}>Sumar a real:</span>
        {QUICK_ADD_MINUTES.map((m) => (
          <button
            key={m}
            className="hv-chip"
            disabled={!canLog}
            title={realTitle}
            onClick={() => void p.addQuickTime(task, a.userId, m)}
            aria-label={`Sumar ${formatQuickAdd(m)} a ${person.firstName}`}
            style={{ border: '1px solid #E1D4EC', background: '#F8F3FB', color: C.purple, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
          >
            +{formatQuickAdd(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
