import { formatMinutes, formatSeconds, type WeekStats } from '../../shared/rules.ts';
import { C, LEXEND } from './ui.tsx';

interface Card {
  label: string;
  value: string;
  sub: string;
  color: string;
  valueColor: string;
  bar?: number;
}

export function StatsCards({ s, capacityHours }: { s: WeekStats; capacityHours: number }) {
  const cards: Card[] = [
    {
      label: 'Cumplimiento del sprint',
      value: `${s.sprintProgress}%`,
      sub: `${s.donePlan} de ${s.totalPlan} tareas planeadas completadas · ${formatSeconds(s.planRealSeconds)} de ${formatMinutes(s.planEstimateMinutes)} est.`,
      color: C.purple,
      valueColor: C.ink,
      bar: s.sprintProgress,
    },
    {
      label: 'Tareas adicionales',
      value: `${s.extraCount} ${s.extraCount === 1 ? 'tarea' : 'tareas'} · ${formatSeconds(s.extraRealSeconds)}`,
      sub: `${s.extraSharePct}% de las horas reales de la semana`,
      color: C.pink,
      valueColor: C.ink,
    },
    {
      label: 'Vencidas sin completar',
      value: String(s.overdue),
      sub: s.overdue ? 'revisa la justificación de cada una' : 'todo al día',
      color: C.yellow,
      valueColor: s.overdue ? C.overRed : C.ink,
    },
    {
      label: 'Personas excedidas',
      value: `${s.exceeded} de ${s.teamSize}`,
      sub: `superan ${formatMinutes(capacityHours * 60)} esta semana`,
      color: C.blue,
      valueColor: s.exceeded ? C.overRed : C.ink,
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 20 }}>
      {cards.map((c) => (
        <div key={c.label} data-testid="stat-card" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
            {c.label}
          </div>
          <div style={{ fontFamily: LEXEND, fontSize: 24, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums', color: c.valueColor, overflowWrap: 'anywhere' }}>{c.value}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{c.sub}</div>
          {c.bar !== undefined && (
            <div role="progressbar" aria-valuenow={c.bar} aria-valuemin={0} aria-valuemax={100} aria-label={c.label} style={{ height: 6, background: '#EFEDF2', borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${c.bar}%`, background: c.color }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
