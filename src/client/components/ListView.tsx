import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { PROGRESS_OPTIONS, STATUSES } from '../../shared/constants.ts';
import { estimateMinutes, formatMinutes, formatSeconds, realSeconds, sortForList, weightedProgress } from '../../shared/rules.ts';
import type { TaskDTO, TaskStatus, TaskType } from '../../shared/types.ts';
import type { Planner } from '../hooks/usePlanner.ts';
import { taskView, type TaskView } from '../lib/taskView.ts';
import { Avatar, C, LEXEND } from './ui.tsx';

const GRID = '30px minmax(0,1fr) 92px 128px 68px 92px 92px 128px 40px';
const stop = (e: MouseEvent<HTMLElement>): void => e.stopPropagation();

interface SectionDef {
  key: TaskType;
  title: string;
  subtitle: string;
  color: string;
  soft: string;
  ph: string;
  emptyText: string;
}

const SECTIONS: SectionDef[] = [
  { key: 'plan', title: 'Planeación', subtitle: 'Lo comprometido al iniciar la semana', color: '#5E1A8C', soft: '#F1E9F7', ph: 'Agregar tarea planeada y presionar Enter', emptyText: 'No hay tareas planeadas con este filtro.' },
  {
    key: 'extra',
    title: 'Tareas adicionales',
    subtitle: 'Surgieron durante la semana y no estaban en el plan',
    color: '#E6195F',
    soft: '#FDE4ED',
    ph: 'Agregar tarea adicional y presionar Enter',
    emptyText: 'Sin tareas adicionales registradas. Cuando llegue una solicitud no planeada, agrégala aquí.',
  },
];

export function ListView({ p, visible, desktop }: { p: Planner; visible: TaskDTO[]; desktop: boolean }) {
  return (
    <>
      {SECTIONS.map((s) => (
        <Section key={s.key} p={p} def={s} tasks={sortForList(visible.filter((t) => t.type === s.key))} desktop={desktop} />
      ))}
    </>
  );
}

function Section({ p, def, tasks, desktop }: { p: Planner; def: SectionDef; tasks: TaskDTO[]; desktop: boolean }) {
  const open = !p.collapsed[def.key];
  const [quick, setQuick] = useState('');
  const [adding, setAdding] = useState(false);
  const est = tasks.reduce((x, t) => x + estimateMinutes(t, p.filter), 0);
  const real = tasks.reduce((x, t) => x + realSeconds(t, p.filter), 0);
  const onQuickKey = async (e: KeyboardEvent<HTMLInputElement>): Promise<void> => {
    if (e.key !== 'Enter' || !quick.trim() || adding) return;
    setAdding(true);
    const ok = await p.quickAdd(def.key, quick);
    setAdding(false);
    if (ok) setQuick('');
  };
  return (
    <section aria-label={def.title} data-testid={`section-${def.key}`} style={{ marginTop: 24, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap', borderBottom: `3px solid ${def.color}` }}>
        <button
          onClick={() => p.setCollapsed({ ...p.collapsed, [def.key]: open })}
          aria-label={open ? 'Contraer sección' : 'Expandir sección'}
          aria-expanded={open}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, color: C.muted, width: 20, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}
        >
          ▼
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 17, margin: 0 }}>{def.title}</h3>
            <span data-testid={`count-${def.key}`} style={{ background: def.soft, color: def.color, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '2px 8px' }}>
              {tasks.length}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{def.subtitle}</div>
        </div>
        <div style={{ fontSize: 13, color: C.ink2, fontVariantNumeric: 'tabular-nums' }}>
          Avance <b>{weightedProgress(tasks)}%</b> · Est. <b>{formatMinutes(est)}</b> · Real <b>{formatSeconds(real)}</b>
        </div>
        <button onClick={() => p.newTask(def.key)} style={{ border: `1px solid ${def.color}`, color: def.color, background: '#fff', borderRadius: 9, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          + Agregar
        </button>
      </div>
      {open && (
        <>
          {desktop && (
            <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted2, background: '#FBFAFC' }}>
              <span />
              <span>Tarea</span>
              <span>Responsables</span>
              <span>Estado</span>
              <span>Prioridad</span>
              <span>Vence</span>
              <span>Avance</span>
              <span>Estimado / Real</span>
              <span />
            </div>
          )}
          {tasks.map((t) => {
            const v = taskView(t, { filter: p.filter, today: p.today, timer: p.timer, team: p.team });
            return desktop ? <DesktopRow key={t.id} p={p} v={v} /> : <MobileRow key={t.id} p={p} v={v} />;
          })}
          {!tasks.length && <div style={{ padding: '20px 16px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line2}` }}>{def.emptyText}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: `1px solid ${C.line2}`, background: '#FBFAFC' }}>
            <span aria-hidden="true" style={{ color: def.color, fontWeight: 800, fontSize: 16, width: 30, textAlign: 'center' }}>
              +
            </span>
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => void onQuickKey(e)}
              placeholder={def.ph}
              aria-label={def.ph}
              maxLength={200}
              disabled={adding}
              style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', padding: '8px 0', fontSize: 14 }}
            />
          </div>
        </>
      )}
    </section>
  );
}

function CheckButton({ p, v, size }: { p: Planner; v: TaskView; size: number }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void p.setStatus(v.task, v.done ? 'todo' : 'done');
      }}
      aria-label={v.done ? `Marcar "${v.name}" como pendiente` : `Marcar "${v.name}" como completada`}
      aria-pressed={v.done}
      title={v.done ? 'Marcar pendiente' : 'Marcar completada'}
      style={{ flex: 'none', width: size, height: size, borderRadius: 7, border: `2px solid ${v.done ? '#7DBA1F' : '#C9C3D2'}`, background: v.done ? '#7DBA1F' : '#fff', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
    >
      {v.done ? '✓' : ''}
    </button>
  );
}

function TimerButton({ p, v, size }: { p: Planner; v: TaskView; size: number }) {
  const label = v.timerOn ? 'Detener cronómetro' : 'Iniciar cronómetro';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        p.rowTimer(v.task);
      }}
      aria-label={`${label}: ${v.name}`}
      title={label}
      style={{ flex: 'none', width: size, height: size, borderRadius: '50%', border: 0, cursor: 'pointer', fontSize: 11, background: v.timerOn ? '#E6195F' : '#F1E9F7', color: v.timerOn ? '#fff' : '#5E1A8C' }}
    >
      {v.timerOn ? '■' : '▶'}
    </button>
  );
}

/** Nombre de la tarea como botón: permite abrir el detalle con teclado. */
function NameButton({ p, v, style }: { p: Planner; v: TaskView; style: CSSProperties }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        p.openTask(v.task.id);
      }}
      title={v.name}
      style={{ display: 'block', maxWidth: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', fontWeight: 700, textDecoration: v.done ? 'line-through' : 'none', color: v.done ? C.muted2 : C.ink, ...style }}
    >
      {v.name}
    </button>
  );
}

function Tag({ bg, color, children }: { bg: string; color: string; children: string }) {
  return <span style={{ fontSize: 11, fontWeight: 800, color, background: bg, borderRadius: 6, padding: '1px 7px' }}>{children}</span>;
}

function DesktopRow({ p, v }: { p: Planner; v: TaskView }) {
  const t = v.task;
  return (
    <div
      className="hv-row"
      data-testid="task-row"
      data-task-name={t.name}
      onClick={() => p.openTask(t.id)}
      style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${C.line2}`, cursor: 'pointer', background: '#fff' }}
    >
      <CheckButton p={p} v={v} size={22} />
      <div style={{ minWidth: 0 }}>
        <NameButton p={p} v={v} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          {t.project && <span style={{ fontSize: 11, fontWeight: 700, color: C.ink2, background: C.soft, borderRadius: 6, padding: '1px 7px' }}>{t.project}</span>}
          {v.carriedLabel && <Tag bg="#FFF5D6" color="#7A5A00">{`↻ ${v.carriedLabel}`}</Tag>}
          {v.movedLabel && <Tag bg="#EFEEF2" color={C.ink2}>{`→ ${v.movedLabel}`}</Tag>}
          {t.type === 'extra' && t.requestedBy && <span style={{ fontSize: 11, color: C.muted }}>Solicitó: {t.requestedBy}</span>}
          {(t.delayByTaskId || t.delayReason) && <span style={{ fontSize: 11, fontWeight: 700, color: C.pinkDark }}>⚑ Retraso justificado</span>}
        </div>
      </div>
      <div style={{ display: 'flex' }}>
        {v.people.map((u, i) => (
          <Avatar key={i} user={u} size={28} overlap={8} />
        ))}
        {!v.people.length && <span style={{ fontSize: 12, color: C.pinkDark, fontWeight: 700 }}>Sin asignar</span>}
      </div>
      <select
        value={t.status}
        onChange={(e) => void p.setStatus(t, e.target.value as TaskStatus)}
        onClick={stop}
        aria-label={`Estado de ${v.name}`}
        style={{ appearance: 'none', border: 0, borderRadius: 999, padding: '6px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', background: v.st.bg, color: v.st.t, width: '100%' }}
      >
        {STATUSES.map((o) => (
          <option key={o.k} value={o.k}>
            {o.l}
          </option>
        ))}
      </select>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: v.pr.c }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.pr.c }} />
        {v.pr.l}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: v.dueColor }}>{v.dueLabel}</span>
      <div onClick={stop} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <select
          value={String(t.progress)}
          onChange={(e) => void p.setProgress(t, Number(e.target.value))}
          aria-label={`Porcentaje de avance de ${v.name}`}
          style={{ appearance: 'none', border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 8px', fontWeight: 800, fontSize: 12, background: '#fff', color: v.progColor, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
        >
          {(PROGRESS_OPTIONS.includes(t.progress) ? PROGRESS_OPTIONS : [...PROGRESS_OPTIONS, t.progress].sort((a, b) => a - b)).map((o) => (
            <option key={o} value={String(o)}>
              {o}%
            </option>
          ))}
        </select>
        <div style={{ height: 4, background: '#EFEDF2', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, width: `${t.progress}%`, background: v.progColor }} />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: C.muted }}>{v.est}</span>
          <span data-testid="row-real" style={{ fontWeight: 800, color: v.over ? C.overRed : C.ink }}>
            {v.real}
          </span>
        </div>
        <div style={{ height: 6, background: '#EFEDF2', borderRadius: 999, marginTop: 5, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, width: `${v.barPct}%`, background: v.barColor }} />
        </div>
      </div>
      <TimerButton p={p} v={v} size={32} />
    </div>
  );
}

function MobileRow({ p, v }: { p: Planner; v: TaskView }) {
  const t = v.task;
  return (
    <div
      data-testid="task-row"
      data-task-name={t.name}
      onClick={() => p.openTask(t.id)}
      style={{ padding: '12px 14px', borderTop: `1px solid ${C.line2}`, display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
    >
      <div style={{ marginTop: 2 }}>
        <CheckButton p={p} v={v} size={24} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <NameButton p={p} v={v} style={{ overflowWrap: 'anywhere' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px', background: v.st.bg, color: v.st.t }}>{v.st.l}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: v.progColor }}>{t.progress}%</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: v.dueColor }}>{v.dueLabel}</span>
          {v.carriedLabel && <Tag bg="#FFF5D6" color="#7A5A00">{`↻ ${v.carriedLabel}`}</Tag>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <div style={{ display: 'flex' }}>
            {v.people.map((u, i) => (
              <Avatar key={i} user={u} size={24} overlap={6} />
            ))}
            {!v.people.length && <span style={{ fontSize: 12, color: C.pinkDark, fontWeight: 700 }}>Sin asignar</span>}
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: C.muted }}>
            {v.est} · <b style={{ color: v.over ? C.overRed : C.ink }}>{v.real}</b>
          </span>
        </div>
      </div>
      <TimerButton p={p} v={v} size={44} />
    </div>
  );
}
