import { useState } from 'react';
import { formatMinutes } from '../../shared/rules.ts';
import { passwordProblems } from '../../shared/validation.ts';
import { api, ApiError } from '../lib/api.ts';
import type { ToastState } from '../hooks/usePlanner.ts';
import { C, FieldError, inputStyle, labelStyle, LEXEND, Modal, primaryBtn, secondaryBtn } from './ui.tsx';

export function HelpModal({ onClose, capacityHours }: { onClose: () => void; capacityHours: number }) {
  const kbd = { background: C.soft, borderRadius: 5, padding: '2px 6px', fontWeight: 800 };
  return (
    <Modal onClose={onClose} labelledBy="help-title">
      <h2 id="help-title" style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 20, margin: 0 }}>
        Cómo funciona
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, fontSize: 14, lineHeight: 1.5, color: C.ink2 }}>
        <div>
          <b style={{ color: C.purple }}>Planeación</b> es lo comprometido el lunes. <b style={{ color: C.pink }}>Tareas adicionales</b> es lo que llega durante la semana.
        </div>
        <div>Cada semana es un tablero nuevo. Al crearlo, las tareas no completadas de la semana anterior se traen marcadas con ↻.</div>
        <div>
          Registra el tiempo como prefieras: con ▶ o a mano en horas y minutos desde el detalle de la tarea. Si alguien supera la capacidad semanal ({formatMinutes(capacityHours * 60)}), aparece como{' '}
          <b style={{ color: C.pinkDark }}>Excedido</b>.
        </div>
        <div>Si una tarea vence sin completarse, relaciona la tarea adicional que la retrasó.</div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 18, fontSize: 12, color: C.muted }}>
        <span>
          <kbd style={kbd}>N</kbd> Nueva tarea
        </span>
        <span>
          <kbd style={kbd}>Alt ← →</kbd> Cambiar semana
        </span>
        <span>
          <kbd style={kbd}>Esc</kbd> Cerrar
        </span>
      </div>
      <button className="hv-primary" onClick={onClose} style={{ ...primaryBtn, marginTop: 20, padding: '10px 18px' }}>
        Entendido
      </button>
    </Modal>
  );
}

export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      data-testid="toast"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 60,
        background: toast.kind === 'error' ? C.pinkDark : C.ink,
        color: '#fff',
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        fontSize: 14,
        boxShadow: '0 12px 32px rgba(30,26,36,.3)',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span>{toast.msg}</span>
      {toast.undo && (
        <button onClick={toast.undo} style={{ border: 0, background: 'transparent', color: C.yellow, fontWeight: 800, cursor: 'pointer' }}>
          Deshacer
        </button>
      )}
      <button onClick={onClose} aria-label="Cerrar aviso" style={{ border: 0, background: 'transparent', color: '#fff', opacity: 0.7, cursor: 'pointer', fontSize: 16 }}>
        ×
      </button>
    </div>
  );
}

export function PasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const submit = async (): Promise<void> => {
    const e: Record<string, string> = {};
    if (!current) e.currentPassword = 'Escribe tu contraseña actual.';
    const prob = passwordProblems(next);
    if (prob) e.newPassword = prob;
    else if (next !== confirm) e.confirm = 'Las contraseñas no coinciden.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, ...(Object.keys(err.fields).length ? {} : { form: err.message }) } : { form: 'No se pudo cambiar la contraseña.' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal onClose={onClose} labelledBy="pw-title" maxWidth={420}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="pw-title" style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 20, margin: '0 0 14px' }}>
          Cambiar contraseña
        </h2>
        {(
          [
            ['currentPassword', 'Contraseña actual', current, setCurrent, 'current-password'],
            ['newPassword', 'Nueva contraseña', next, setNext, 'new-password'],
            ['confirm', 'Confirmar nueva contraseña', confirm, setConfirm, 'new-password'],
          ] as const
        ).map(([k, l, v, set, ac]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label htmlFor={`pw-${k}`} style={labelStyle}>
              {l}
            </label>
            <input id={`pw-${k}`} type="password" autoComplete={ac} value={v} onChange={(e) => set(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
            <FieldError>{errors[k]}</FieldError>
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.muted }}>Mínimo 10 caracteres, con letras y números. Se cerrarán tus otras sesiones.</div>
        <FieldError>{errors.form}</FieldError>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Cancelar
          </button>
          <button type="submit" className="hv-primary" disabled={saving} style={primaryBtn}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
