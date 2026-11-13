import { useEffect, useRef, useState } from 'react';
import { computeWeekStats, filterTasks } from '../../shared/rules.ts';
import type { BootstrapDTO } from '../../shared/types.ts';
import { usePlanner } from '../hooks/usePlanner.ts';
import { useTick, useWindowWidth } from '../lib/hooks.ts';
import { AdminPanel } from './AdminPanel.tsx';
import { BoardView } from './BoardView.tsx';
import { EmptyWeek } from './EmptyWeek.tsx';
import { Header } from './Header.tsx';
import { ListView } from './ListView.tsx';
import { LoadView } from './LoadView.tsx';
import { HelpModal, PasswordModal, Toast } from './Overlays.tsx';
import { StatsCards } from './StatsCards.tsx';
import { TaskDrawer } from './TaskDrawer.tsx';
import { C, primaryBtn, Spinner } from './ui.tsx';
import { WeekBar } from './WeekBar.tsx';

export function PlannerPage({ boot, onLogout }: { boot: BootstrapDTO; onLogout: () => void }) {
  const p = usePlanner(boot);
  useTick(!!p.timer);
  const w = useWindowWidth();
  const [help, setHelp] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [pw, setPw] = useState(false);
  const desktop = w >= 1180;

  // Atajos de teclado del prototipo: N, Alt+←/→, Esc.
  const stateRef = useRef({ p, help, admin, pw });
  stateRef.current = { p, help, admin, pw };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const s = stateRef.current;
      const tag = ((e.target as HTMLElement | null)?.tagName ?? '').toLowerCase();
      const typing = ['input', 'textarea', 'select'].includes(tag);
      if (e.key === 'Escape') {
        if (s.help) setHelp(false);
        return;
      }
      if (typing || s.p.openTaskDTO || s.help || s.admin || s.pw) return;
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && s.p.week?.exists) {
        e.preventDefault();
        s.p.newTask('plan');
      }
      if (e.altKey && e.key === 'ArrowLeft') s.p.goWeek(-1);
      if (e.altKey && e.key === 'ArrowRight') s.p.goWeek(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tasks = p.liveTasks;
  const visible = filterTasks(tasks, { userId: p.filter, query: p.query });
  const stats = computeWeekStats(visible, tasks, { userId: p.filter, today: p.today, team: p.team, capacityHours: p.settings.capacityHours });

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header p={p} onHelp={() => setHelp(true)} onAdmin={() => setAdmin(true)} onPassword={() => setPw(true)} onLogout={onLogout} />
      <main style={{ maxWidth: 1440, margin: '0 auto', padding: desktop ? '20px 24px 96px' : '16px 14px 96px' }}>
        <WeekBar p={p} />
        {p.loading && !p.week && (
          <div style={{ marginTop: 24 }}>
            <Spinner label="Cargando la semana…" />
            <div className="skeleton" style={{ height: 96, marginTop: 16 }} />
            <div className="skeleton" style={{ height: 280, marginTop: 16 }} />
          </div>
        )}
        {p.loadError && (
          <div role="alert" style={{ marginTop: 24, background: '#fff', border: '1px solid #F6C9D8', borderRadius: 16, padding: 24, maxWidth: 640 }}>
            <div style={{ fontWeight: 800, color: C.pinkDark }}>No se pudo cargar la semana</div>
            <p style={{ color: C.ink2 }}>{p.loadError}</p>
            <button className="hv-primary" onClick={p.reload} style={primaryBtn}>
              Reintentar
            </button>
          </div>
        )}
        {p.week && !p.loadError && p.week.weekId === p.weekId && (
          <div aria-busy={p.loading} style={{ opacity: p.loading ? 0.6 : 1, transition: 'opacity .15s' }}>
            {!p.week.exists ? (
              <EmptyWeek p={p} />
            ) : (
              <>
                <StatsCards s={stats} capacityHours={p.settings.capacityHours} />
                {p.query && !visible.length && (
                  <div role="status" style={{ marginTop: 16, color: C.muted }}>
                    No hay tareas que coincidan con “{p.query}”.
                  </div>
                )}
                {p.view === 'lista' && <ListView p={p} visible={visible} desktop={desktop} />}
                {p.view === 'tablero' && <BoardView p={p} visible={visible} />}
                {p.view === 'carga' && <LoadView p={p} tasks={tasks} mobile={w < 760} />}
              </>
            )}
          </div>
        )}
        {p.week && p.week.weekId !== p.weekId && p.loading && (
          <div style={{ marginTop: 24 }}>
            <Spinner label="Cargando la semana…" />
          </div>
        )}
      </main>

      {p.openTaskDTO && <TaskDrawer key={p.drawerKey} p={p} task={p.openTaskDTO} width={w < 760 ? '100%' : '500px'} />}
      {help && <HelpModal onClose={() => setHelp(false)} capacityHours={p.settings.capacityHours} />}
      {admin && (
        <AdminPanel
          me={p.me}
          settings={p.settings}
          onClose={() => setAdmin(false)}
          onChanged={() => void p.refreshMeta()}
          notify={(m) => p.showToast(m)}
        />
      )}
      {pw && (
        <PasswordModal
          onClose={() => setPw(false)}
          onDone={() => {
            setPw(false);
            p.showToast('Contraseña actualizada');
          }}
        />
      )}
      <Toast toast={p.toast} onClose={p.dismissToast} />
    </div>
  );
}
