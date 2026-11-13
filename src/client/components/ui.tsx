import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { UserDTO } from '../../shared/types.ts';

export const C = {
  purple: '#5E1A8C',
  purpleDark: '#4B1270',
  pink: '#E6195F',
  pinkDark: '#A10F43',
  yellow: '#FFC20E',
  blue: '#22A7E8',
  green: '#7DBA1F',
  greenDark: '#47740A',
  ink: '#1E1A24',
  ink2: '#4A4752',
  muted: '#6B6B73',
  muted2: '#8A8A8F',
  line: '#E7E4EC',
  line2: '#F1EFF4',
  bg: '#F7F6F9',
  soft: '#F3F1F6',
  overRed: '#C2134F',
} as const;

export const LEXEND = 'Lexend, sans-serif';

/** Avatar con iniciales. Dentro de un control con nombre propio, use decorative para no duplicar el nombre accesible. */
export function Avatar({ user, size = 28, ring = true, overlap = 0, decorative = false }: { user: Pick<UserDTO, 'initials' | 'color' | 'name'>; size?: number; ring?: boolean; overlap?: number; decorative?: boolean }) {
  return (
    <span
      title={decorative ? undefined : user.name}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : user.name}
      aria-hidden={decorative ? true : undefined}
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: user.color,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: size >= 36 ? 12 : size >= 28 ? 10 : 9,
        fontWeight: 800,
        border: ring ? '2px solid #fff' : undefined,
        marginRight: overlap ? -overlap : undefined,
      }}
    >
      {user.initials}
    </span>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.muted, fontSize: 13 }}>
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Modal accesible: cierra con Esc o clic fuera, y enfoca el contenido al abrir. */
export function Modal({ title, onClose, children, maxWidth = 480, labelledBy }: { title?: string; onClose: () => void; children: ReactNode; maxWidth?: number; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,26,36,.32)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, maxWidth, width: '100%', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', padding: 24, animation: 'elin .2s ease', outline: 'none' }}
      >
        {children}
      </div>
    </div>
  );
}

export const primaryBtn: CSSProperties = {
  border: 0,
  background: C.purple,
  color: '#fff',
  borderRadius: 10,
  padding: '11px 18px',
  fontWeight: 700,
  cursor: 'pointer',
};

export const secondaryBtn: CSSProperties = {
  border: `1px solid ${C.line}`,
  background: '#fff',
  color: C.ink2,
  borderRadius: 10,
  padding: '11px 18px',
  fontWeight: 700,
  cursor: 'pointer',
};

export const inputStyle: CSSProperties = {
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: '9px 10px',
  fontSize: 13,
  color: C.ink,
  background: '#fff',
  width: '100%',
};

export const labelStyle: CSSProperties = { color: C.muted, fontWeight: 700, fontSize: 13 };

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <div id={id} role="alert" style={{ color: C.pinkDark, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
      {children}
    </div>
  );
}
