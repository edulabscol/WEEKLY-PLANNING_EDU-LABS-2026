import type { ViewMode } from '../../shared/types.ts';
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
  const badge = cmp === 0 ? ['Esta semana', '#ECF6DE', '#47740A'] : cmp < 0 ? ['Cerrada', '#EFEEF2', '#4A4752'] : ['Próxima', '#E1F3FC', '#0B6A99'];
  const navBtn = (enabled: boolean) => ({ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontSize: 20, color: C.ink2, cursor: 'pointer', opacity: enabled ? 1 : 0.4 });
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => p.goWeek(-1)} disabled={!p.canPrev} aria-label="Semana anterior" style={navBtn(p.canPrev)}>
            ‹
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 data-testid="week-title" style={{ fontFamily: LEXEND, fontSize: 26, fontWeight: 600, letterSpacing: '-.01em', margin: 0 }}>
                Semana {weekNumber(p.weekId)}
              </h2>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: badge[1], color: badge[2] }}>{badge[0]}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{formatWeekRange(p.weekId)}</div>
          </div>
          <button onClick={() => p.goWeek(1)} disabled={!p.canNext} aria-label="Semana siguiente" style={navBtn(p.canNext)}>
            ›
          </button>
          {cmp !== 0 && (
            <button onClick={p.goToday} style={{ border: 0, background: 'transparent', color: C.purple, fontWeight: 700, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Ir a esta semana
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
        Semana cerrada. Puedes consultar y corregir horas.
        {moved ? ` ${moved} tareas no completadas pasaron a la Semana ${target ? weekNumber(target) : ''}.` : ''}
      </span>
    </div>
  );
}
