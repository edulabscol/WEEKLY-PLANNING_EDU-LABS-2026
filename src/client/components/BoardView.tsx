import { useState } from 'react';
import { STATUSES } from '../../shared/constants.ts';
import { sortByDue } from '../../shared/rules.ts';
import type { TaskDTO, TaskStatus } from '../../shared/types.ts';
import type { Planner } from '../hooks/usePlanner.ts';
import { taskView } from '../lib/taskView.ts';
import { Avatar, C, LEXEND } from './ui.tsx';

export function BoardView({ p, visible }: { p: Planner; visible: TaskDTO[] }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const end = (): void => {
    setDragId(null);
    setOver(null);
  };
  return (
    <div data-testid="board" style={{ display: 'flex', gap: 14, overflowX: 'auto', marginTop: 24, paddingBottom: 12, alignItems: 'flex-start' }}>
      {STATUSES.map((st) => {
        const list = sortByDue(visible.filter((t) => t.status === st.k));
        const hov = !!dragId && over === st.k;
        return (
          <div
            key={st.k}
            data-testid={`column-${st.k}`}
            aria-label={`Columna ${st.l}`}
            role="region"
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== st.k) setOver(st.k);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              end();
              const t = visible.find((x) => x.id === id);
              if (t && t.status !== st.k) void p.setStatus(t, st.k);
            }}
            style={{ flex: '0 0 280px', background: hov ? '#F1E9F7' : '#EFEDF2', borderRadius: 16, padding: 10, minHeight: 300, border: `2px dashed ${hov ? C.purple : 'transparent'}` }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: st.c }} />
              <span style={{ fontFamily: LEXEND, fontWeight: 600 }}>{st.l}</span>
              <span style={{ color: C.muted, fontWeight: 700, fontSize: 12 }}>{list.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((t) => {
                const v = taskView(t, { filter: p.filter, today: p.today, timer: p.timer, team: p.team, sprintName: p.sprintName });
                return (
                  <div
                    key={t.id}
                    className="hv-card"
                    data-testid="board-card"
                    data-task-name={t.name}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(t.id);
                    }}
                    onDragEnd={end}
                    onClick={() => p.openTask(t.id)}
                    style={{ background: '#fff', borderRadius: 12, padding: 12, border: `1px solid ${C.line}`, cursor: 'grab', boxShadow: '0 1px 2px rgba(30,26,36,.05)', opacity: dragId === t.id ? 0.6 : 1 }}
                  >
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: v.typeColor, background: v.typeSoft, borderRadius: 5, padding: '2px 6px' }}>{v.typeLabel}</span>
                      {v.carriedLabel && <span style={{ fontSize: 10, fontWeight: 800, color: '#7A5A00', background: '#FFF5D6', borderRadius: 5, padding: '2px 6px' }}>↻ {v.carriedLabel}</span>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        p.openTask(t.id);
                      }}
                      style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', font: 'inherit', fontWeight: 700, lineHeight: 1.35, color: C.ink, cursor: 'pointer' }}
                    >
                      {v.name}
                    </button>
                    {t.project && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{t.project}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <div style={{ flex: 1, height: 5, background: '#EFEDF2', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.progress}%`, background: v.progColor }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: v.progColor, fontVariantNumeric: 'tabular-nums' }}>{t.progress}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <div style={{ display: 'flex' }}>
                        {v.people.map((u, i) => (
                          <Avatar key={i} user={u} size={24} overlap={6} />
                        ))}
                      </div>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: v.dueColor }}>{v.dueLabel}</span>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: v.over ? C.overRed : C.ink, fontWeight: 800 }}>{v.real}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
