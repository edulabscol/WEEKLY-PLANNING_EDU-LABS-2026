import { statusMeta } from '../../shared/constants.ts';
import { formatMinutes } from '../../shared/rules.ts';
import { weekNumber } from '../../shared/weeks.ts';
import type { Planner } from '../hooks/usePlanner.ts';
import { C, LEXEND, primaryBtn, secondaryBtn } from './ui.tsx';

export function EmptyWeek({ p }: { p: Planner }) {
  const w = p.week;
  if (!w) return null;
  const n = weekNumber(w.weekId);
  const prev = w.previous;
  const pending = prev?.pending ?? [];
  const prevN = prev ? weekNumber(prev.weekId) : n - 1;
  return (
    <div style={{ marginTop: 24, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 32, maxWidth: 640, animation: 'elin .3s ease' }}>
      <h3 style={{ fontFamily: LEXEND, fontSize: 22, fontWeight: 600, margin: 0 }}>Semana {n} aún no tiene tablero</h3>
      <p style={{ color: C.ink2, lineHeight: 1.55, margin: '8px 0 20px' }}>
        {pending.length
          ? `Al crearlo se traerán ${pending.length} tareas no completadas de la Semana ${prevN}, con las horas que les faltan como nuevo estimado. Quedarán marcadas como “Viene de S${prevN}”.`
          : prev
            ? 'La semana anterior no dejó tareas pendientes.'
            : 'Este será el primer tablero del equipo.'}
      </p>
      {pending.length > 0 && (
        <ul aria-label="Tareas pendientes" style={{ border: '1px solid #EFEDF2', borderRadius: 12, marginBottom: 20, padding: 0, listStyle: 'none' }}>
          {pending.map((t, i) => {
            const st = statusMeta(t.status);
            return (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? '1px solid #F3F1F6' : undefined }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.c, flex: 'none' }} />
                <span style={{ flex: 1, fontWeight: 600, minWidth: 0 }}>{t.name}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{st.l}</span>
                <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>Faltan {formatMinutes(t.leftMinutes)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {w.canCreate ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="hv-primary" disabled={p.busy} onClick={() => void p.createWeek(true)} style={{ ...primaryBtn, padding: '12px 18px' }}>
            {pending.length ? `Crear tablero y traer ${pending.length} pendientes` : 'Crear tablero'}
          </button>
          {pending.length > 0 && (
            <button disabled={p.busy} onClick={() => void p.createWeek(false)} style={{ ...secondaryBtn, padding: '12px 18px' }}>
              Crear tablero vacío
            </button>
          )}
        </div>
      ) : (
        <div role="note" style={{ background: C.soft, borderRadius: 10, padding: '12px 14px', color: C.ink2, fontSize: 13 }}>
          {p.isAdmin
            ? 'Solo se puede crear el tablero de la semana siguiente a la última registrada o el de la semana actual.'
            : 'Coordinación crea el tablero de cada semana. Cuando esté listo, aparecerá aquí.'}
        </div>
      )}
    </div>
  );
}
