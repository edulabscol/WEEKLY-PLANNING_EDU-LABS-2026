import { useState } from 'react';
import { STATUS_ORDER, statusMeta } from '../../shared/constants.ts';
import { computeTeamLoad, formatMinutes, formatSeconds } from '../../shared/rules.ts';
import type { TaskDTO } from '../../shared/types.ts';
import type { Planner } from '../hooks/usePlanner.ts';
import { Avatar, C, LEXEND } from './ui.tsx';

export function LoadView({ p, tasks, mobile }: { p: Planner; tasks: TaskDTO[]; mobile: boolean }) {
  const [openUser, setOpenUser] = useState<string | null>(null);
  const cap = p.settings.capacityHours;
  const load = computeTeamLoad(tasks, p.team, cap);
  const scale = Math.max(cap * 1.25 * 3600, ...load.map((l) => l.realSeconds));
  const cols = mobile ? '1fr' : 'minmax(200px,260px) minmax(0,1fr) 190px';
  const itemCols = mobile ? '1fr' : 'minmax(0,1fr) 190px 170px';
  return (
    <section aria-label="Carga del equipo" data-testid="load-view" style={{ marginTop: 24, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, flexWrap: 'wrap', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 17, margin: 0 }}>Carga del equipo · {p.sprintName(p.weekId)}</h3>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Horas reales registradas por persona frente a la capacidad semanal de {formatMinutes(cap * 60)}. Toca una persona para ver en qué tareas estuvo.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: C.ink2, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: C.purple }} />
            Planeado
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: C.pink }} />
            Adicional
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 2, height: 14, background: C.ink }} />
            Capacidad
          </span>
        </div>
      </div>
      {!load.length && <div style={{ padding: 16, color: C.muted }}>No hay personas en el equipo. Coordinación puede agregarlas en “Equipo y ajustes”.</div>}
      {load.map((l) => {
        const open = openUser === l.user.id;
        const state = l.state === 'exceeded' ? [`Excedido +${formatMinutes(l.deltaMinutes)}`, '#FDE4ED', '#A10F43'] : l.state === 'limit' ? ['Al límite', '#FFF3CF', '#7A5A00'] : [`Disponible ${formatMinutes(l.deltaMinutes)}`, '#ECF6DE', '#47740A'];
        const items = open
          ? tasks
              .filter((t) => t.assignees.some((a) => a.userId === l.user.id))
              .sort((x, y) => (x.type === y.type ? 0 : x.type === 'plan' ? -1 : 1) || STATUS_ORDER[x.status] - STATUS_ORDER[y.status])
          : [];
        return (
          <div key={l.user.id} data-testid="load-row">
            <button
              onClick={() => setOpenUser(open ? null : l.user.id)}
              aria-expanded={open}
              aria-label={`${l.user.name}: ${formatSeconds(l.realSeconds)} registradas. ${state[0]}`}
              className="hv-row"
              style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', padding: '14px 16px', border: 0, borderTop: `1px solid ${C.line2}`, cursor: 'pointer', width: '100%', background: '#fff', textAlign: 'left', font: 'inherit', color: C.ink }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar user={l.user} size={36} ring={false} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{l.user.name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {l.user.jobTitle} · {l.taskCount} {l.taskCount === 1 ? 'tarea' : 'tareas'}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ position: 'relative', height: 18, background: C.line2, borderRadius: 6, overflow: 'visible' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', borderRadius: 6, overflow: 'hidden', width: `${(l.realSeconds / scale) * 100}%` }}>
                    <div style={{ background: C.purple, width: `${l.realSeconds ? (l.planSeconds / l.realSeconds) * 100 : 0}%` }} />
                    <div style={{ background: C.pink, flex: 1 }} />
                  </div>
                  <div style={{ position: 'absolute', top: -4, bottom: -4, width: 2, background: C.ink, left: `${((cap * 3600) / scale) * 100}%` }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: C.muted, marginTop: 6, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
                  <span>Planeado {formatSeconds(l.planSeconds)}</span>
                  <span>Adicional {formatSeconds(l.extraSeconds)}</span>
                  <span>Estimado {formatMinutes(l.estimateMinutes)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: mobile ? 'flex-start' : 'flex-end' }}>
                <span style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 20, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatSeconds(l.realSeconds)}</span>
                <span data-testid="load-state" style={{ fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', background: state[1], color: state[2] }}>
                  {state[0]}
                </span>
                <span aria-hidden="true" style={{ fontSize: 11, color: C.muted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                  ▼
                </span>
              </div>
            </button>
            {open && (
              <div style={{ background: '#FBFAFC', borderTop: `1px solid ${C.line2}`, padding: '8px 16px 14px', animation: 'elin .2s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', flex: 1 }}>Tareas de {l.user.firstName} esta semana</span>
                  <button
                    onClick={() => {
                      p.setFilter(l.user.id);
                      p.setView('lista');
                    }}
                    style={{ border: 0, background: 'transparent', color: C.purple, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Ver en la lista
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((t) => {
                    const a = t.assignees.find((x) => x.userId === l.user.id);
                    const st = statusMeta(t.status);
                    const done = t.status === 'done';
                    const plan = t.type === 'plan';
                    const real = a?.realSeconds ?? 0;
                    const est = a?.estimateMinutes ?? 0;
                    return (
                      <button
                        key={t.id}
                        className="hv-card"
                        onClick={() => p.openTask(t.id)}
                        style={{ display: 'grid', gridTemplateColumns: itemCols, gap: 12, alignItems: 'center', background: '#fff', border: '1px solid #EEEBF2', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: C.ink }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: plan ? '#5E1A8C' : '#C2134F', background: plan ? '#F1E9F7' : '#FDE4ED', borderRadius: 5, padding: '2px 6px' }}>{plan ? 'Planeada' : 'Adicional'}</span>
                            {t.project && <span style={{ fontSize: 11, color: C.muted }}>{t.project}</span>}
                            {t.assignees.length > 1 && <span style={{ fontSize: 11, color: C.muted }}>· compartida</span>}
                          </div>
                          <div style={{ fontWeight: 700, marginTop: 3, textDecoration: done ? 'line-through' : 'none', color: done ? C.muted : C.ink }}>{t.name || 'Sin título'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px', background: st.bg, color: st.t }}>{st.l}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: t.progress === 100 ? '#47740A' : C.purple }}>{t.progress}%</span>
                        </div>
                        <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: C.muted, textAlign: mobile ? 'left' : 'right' }}>
                          Est. {formatMinutes(est)} · <b style={{ color: real / 60 > est ? C.overRed : C.ink }}>Real {formatSeconds(real)}</b>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!items.length && <div style={{ fontSize: 13, color: C.muted, padding: '6px 0' }}>Sin tareas asignadas esta semana.</div>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
