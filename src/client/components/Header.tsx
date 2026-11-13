import { useEffect, useRef, useState } from 'react';
import { ROLE_LABELS } from '../../shared/constants.ts';
import { formatClock } from '../../shared/rules.ts';
import type { UserDTO } from '../../shared/types.ts';
import type { Planner } from '../hooks/usePlanner.ts';
import { Avatar, C, LEXEND } from './ui.tsx';

const LOGO = 'https://moodle.com/wp-content/uploads/2019/03/edulabs.png';

export function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span style={{ fontFamily: LEXEND, fontWeight: 700, fontSize: 18, color: C.purple, letterSpacing: '-.01em' }}>Edu Labs</span>;
  }
  return <img src={LOGO} alt="Edu Labs" onError={() => setFailed(true)} style={{ height: 30, width: 'auto', display: 'block' }} />;
}

export function BrandStripe() {
  return (
    <div style={{ display: 'flex', height: 4 }} aria-hidden="true">
      <div style={{ flex: 1, background: '#FFC20E' }} />
      <div style={{ flex: 1, background: '#E6195F' }} />
      <div style={{ flex: 2, background: '#5E1A8C' }} />
      <div style={{ flex: 1, background: '#22A7E8' }} />
      <div style={{ flex: 1, background: '#7DBA1F' }} />
    </div>
  );
}

function UserMenu({ user, onAdmin, onPassword, onLogout }: { user: UserDTO; onAdmin: (() => void) | null; onPassword: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const item = { display: 'block', width: '100%', textAlign: 'left' as const, border: 0, background: 'transparent', padding: '10px 14px', fontSize: 14, fontWeight: 600, color: C.ink, cursor: 'pointer', borderRadius: 8 };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menú de ${user.name}`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 10, padding: '0 10px 0 4px', cursor: 'pointer' }}
      >
        <Avatar user={user} size={28} ring={false} decorative />
        <span style={{ fontWeight: 700, fontSize: 13, color: C.ink, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.firstName}</span>
        <span aria-hidden="true" style={{ fontSize: 10, color: C.muted }}>▼</span>
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 44, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(30,26,36,.16)', padding: 6, minWidth: 220, zIndex: 35, animation: 'elin .15s ease' }}>
          <div style={{ padding: '8px 14px 10px', borderBottom: `1px solid ${C.line2}`, marginBottom: 4 }}>
            <div style={{ fontWeight: 800 }}>{user.name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {ROLE_LABELS[user.role]} · {user.email}
            </div>
          </div>
          {onAdmin && (
            <button role="menuitem" className="hv-ghost" style={item} onClick={() => (setOpen(false), onAdmin())}>
              Equipo y ajustes
            </button>
          )}
          <button role="menuitem" className="hv-ghost" style={item} onClick={() => (setOpen(false), onPassword())}>
            Cambiar contraseña
          </button>
          <button role="menuitem" className="hv-ghost" style={{ ...item, color: C.pinkDark }} onClick={() => (setOpen(false), onLogout())}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ p, onHelp, onAdmin, onPassword, onLogout }: { p: Planner; onHelp: () => void; onAdmin: () => void; onPassword: () => void; onLogout: () => void }) {
  const timerUser = p.timer ? p.team.find((u) => u.id === p.timer?.userId) : undefined;
  return (
    <header style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 24px', flexWrap: 'wrap', maxWidth: 1440, margin: '0 auto' }}>
        <Logo />
        <div style={{ width: 1, height: 26, background: C.line }} />
        <h1 style={{ fontFamily: LEXEND, fontWeight: 500, fontSize: 15, color: C.ink2, margin: 0 }}>Planeación semanal</h1>
        <div style={{ flex: 1, minWidth: 8 }} />
        {p.timer && (
          <div role="status" aria-label="Cronómetro activo" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FDE6EE', color: C.pinkDark, borderRadius: 999, padding: '5px 6px 5px 12px', fontWeight: 700, fontSize: 13, maxWidth: '100%' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.pink, animation: 'elpulse 1.2s infinite', flex: 'none' }} />
            <span data-testid="timer-clock" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatClock(p.timerElapsed)}
            </span>
            <span style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(timerUser?.firstName ?? '') + ' · ' + (p.timer.taskName || 'Sin título')}
            </span>
            <button onClick={() => void p.stopTimer()} style={{ border: 0, background: C.pink, color: '#fff', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', flex: 'none' }}>
              ■ Detener
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.soft, borderRadius: 10, padding: '0 12px', height: 38, minWidth: 180, flex: '0 1 240px' }}>
          <span aria-hidden="true" style={{ color: C.muted2, fontSize: 14 }}>
            ⌕
          </span>
          <input
            type="search"
            value={p.query}
            onChange={(e) => p.setQuery(e.target.value)}
            placeholder="Buscar tarea o proyecto"
            aria-label="Buscar"
            maxLength={100}
            style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0, fontSize: 14, color: C.ink }}
          />
        </div>
        <button onClick={onHelp} aria-label="Ayuda" title="Ayuda y atajos" style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', fontFamily: LEXEND, fontWeight: 600, color: C.purple, cursor: 'pointer' }}>
          ?
        </button>
        <button
          className="hv-primary"
          onClick={() => p.newTask('plan')}
          disabled={!p.week?.exists}
          style={{ height: 38, border: 0, borderRadius: 10, background: C.purple, color: '#fff', fontWeight: 700, fontSize: 14, padding: '0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
            +
          </span>
          <span>Nueva tarea</span>
        </button>
        <UserMenu user={p.me} onAdmin={p.isAdmin ? onAdmin : null} onPassword={onPassword} onLogout={onLogout} />
      </div>
      <BrandStripe />
    </header>
  );
}
