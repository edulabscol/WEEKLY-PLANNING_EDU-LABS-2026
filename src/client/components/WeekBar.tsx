import type { ViewMode } from '../../shared/types.ts';
import { useEffect, useRef, useState } from 'react';
import { compareWeekIds, formatWeekRange, weekNumber } from '../../shared/weeks.ts';
import type { Planner } from '../hooks/usePlanner.ts';
import { Avatar, C, LEXEND } from './ui.tsx';

const TABS: Array<[ViewMode, string]> = [
  ['lista', 'Lista'],
  ['tablero', 'Tablero'],
  ['carga', 'Carga del equipo'],
];

export function WeekBar({ p }: { p: Planner }) {
  const cmp = compareWeekIds(p.weekId, p.currentWeekId);
  const badge = cmp === 0 ? ['Sprint actual', '#ECF6DE', '#47740A'] : cmp < 0 ? ['Cerrado', '#EFEEF2', '#4A4752'] : ['Próximo', '#E1F3FC', '#0B6A99'];
  const navBtn = (enabled: boolean) => ({ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 20, color: C.ink2, cursor: 'pointer', opacity: enabled ? 1 : 0.4 });
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => p.goWeek(-1)} disabled={!p.canPrev} aria-label="Sprint anterior" style={navBtn(p.canPrev)}>
            ‹
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SprintTitle p={p} />
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: badge[1], color: badge[2] }}>{badge[0]}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              Semana {weekNumber(p.weekId)} · {formatWeekRange(p.weekId)}
            </div>
          </div>
          <button onClick={() => p.goWeek(1)} disabled={!p.canNext} aria-label="Sprint siguiente" style={navBtn(p.canNext)}>
            ›
          </button>
          {cmp !== 0 && (
            <button onClick={p.goToday} style={{ border: 0, background: 'transparent', color: C.purple, fontWeight: 700, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Ir al sprint en curso
            </button>
          )}
        </div>
        <div role="tablist" aria-label="Vista" style={{ display: 'flex', gap: 4, background: '#EDEAF1', padding: 4, borderRadius: 12, overflowX: 'auto', maxWidth: '100%' }}>
          {TABS.map(([k, l]) => {
            const on = p.view === k;
            return (
              <button
                key={k}
                role="tab"
                aria-selected={on}
                onClick={() => p.setView(k)}
                style={{ border: 0, borderRadius: 9, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? '#fff' : 'transparent', color: on ? C.purple : C.ink2, boxShadow: on ? '0 1px 3px rgba(30,26,36,.12)' : 'none' }}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <div role="group" aria-label="Filtrar por persona" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>Equipo</span>
        <button
          onClick={() => p.setFilter(null)}
          aria-pressed={!p.filter}
          style={{ border: `1px solid ${p.filter ? C.line : C.purple}`, background: p.filter ? '#fff' : C.purple, color: p.filter ? C.ink2 : '#fff', borderRadius: 999, padding: '5px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
        >
          Todos
        </button>
        {p.team.map((u) => {
          const on = p.filter === u.id;
          return (
            <button
              key={u.id}
              onClick={() => p.setFilter(on ? null : u.id)}
              aria-pressed={on}
              title={`${u.name} · ${u.jobTitle}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? C.purple : C.line}`, background: on ? '#F1E9F7' : '#fff', borderRadius: 999, padding: '3px 10px 3px 3px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.ink }}
            >
              <Avatar user={u} size={24} ring={false} decorative />
              <span>{u.firstName}</span>
            </button>
          );
        })}
      </div>

      {p.week?.exists && cmp < 0 && <ClosedBanner p={p} />}
    </>
  );
}

function ClosedBanner({ p }: { p: Planner }) {
  const moved = p.liveTasks.filter((t) => t.movedToWeek).length;
  const target = p.liveTasks.find((t) => t.movedToWeek)?.movedToWeek;
  return (
    <div style={{ marginTop: 16, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', color: C.ink2, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.muted2, flex: 'none' }} />
      <span>
        Sprint cerrado. Puedes consultar y corregir horas.
        {moved ? ` ${moved} tareas no completadas pasaron a ${target ? p.sprintName(target) : 'el siguiente sprint'}.` : ''}
      </span>
    </div>
  );
}

const TITLE_STYLE = { fontFamily: LEXEND, fontSize: 26, fontWeight: 600, letterSpacing: '-.01em', margin: 0 } as const;

/** Nombre del sprint. Coordinación lo edita con un clic: Enter o salir del campo guarda, Esc cancela. */
function SprintTitle({ p }: { p: Planner }) {
  const name = p.sprintName(p.weekId);
  const editable = p.isAdmin && !!p.week?.exists && p.week.weekId === p.weekId;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setEditing(false);
  }, [p.weekId]);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  if (!editable) {
    return (
      <h2 data-testid="week-title" style={TITLE_STYLE}>
        {name}
      </h2>
    );
  }

  const start = () => {
    setValue(name);
    setEditing(true);
  };
  const save = async () => {
    if (saving) return;
    const clean = value.trim();
    if (!clean || clean === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await p.renameWeek(clean);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <h2 data-testid="week-title" style={TITLE_STYLE}>
        <input
          ref={input}
          aria-label="Nombre del sprint"
          value={value}
          maxLength={60}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          style={{ ...TITLE_STYLE, width: `${Math.max(value.length, 6) + 1}ch`, maxWidth: '60vw', border: `2px solid ${C.purple}`, borderRadius: 8, padding: '0 6px', background: '#fff', color: C.ink, outline: 'none' }}
        />
      </h2>
    );
  }

  return (
    <h2 data-testid="week-title" style={TITLE_STYLE}>
      <button
        type="button"
        onClick={start}
        title="Clic para cambiar el nombre del sprint"
        aria-label={`${name}. Cambiar nombre del sprint`}
        className="sprint-name"
        style={{ ...TITLE_STYLE, border: 0, background: 'transparent', padding: '0 6px', margin: '0 -6px', borderRadius: 8, cursor: 'text', color: C.ink }}
      >
        {name}
      </button>
    </h2>
  );
}
