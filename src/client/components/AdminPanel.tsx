import { useEffect, useState } from 'react';
import { LIMITS, ROLE_LABELS } from '../../shared/constants.ts';
import type { AuditEntryDTO, Page, Role, SettingsDTO, UserDTO, ViewMode } from '../../shared/types.ts';
import { passwordProblems } from '../../shared/validation.ts';
import { api, ApiError } from '../lib/api.ts';
import { Avatar, C, FieldError, inputStyle, labelStyle, LEXEND, Modal, primaryBtn, secondaryBtn, Spinner } from './ui.tsx';

type Tab = 'equipo' | 'ajustes' | 'actividad';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inició sesión',
  'auth.logout': 'Cerró sesión',
  'auth.login_failed': 'Intento de acceso fallido',
  'auth.login_locked': 'Acceso bloqueado temporalmente',
  'auth.password_changed': 'Cambió su contraseña',
  'week.create': 'Creó un tablero semanal',
  'task.create': 'Creó una tarea',
  'task.update': 'Editó una tarea',
  'task.delete': 'Eliminó una tarea',
  'task.restore': 'Restauró una tarea',
  'assignee.add': 'Asignó un responsable',
  'assignee.update': 'Actualizó estimado o tiempo',
  'assignee.remove': 'Quitó un responsable',
  'time.add': 'Sumó tiempo',
  'timer.start': 'Inició cronómetro',
  'timer.stop': 'Detuvo cronómetro',
  'settings.update': 'Cambió los ajustes',
  'user.create': 'Creó una persona',
  'user.update': 'Editó una persona',
  'seed.demo': 'Cargó datos de ejemplo',
};

export function AdminPanel({ me, settings, onClose, onChanged, notify }: { me: UserDTO; settings: SettingsDTO; onClose: () => void; onChanged: () => void; notify: (msg: string) => void }) {
  const [tab, setTab] = useState<Tab>('equipo');
  return (
    <Modal onClose={onClose} labelledBy="admin-title" maxWidth={760}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="admin-title" style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 20, margin: 0, flex: 1 }}>
          Equipo y ajustes
        </h2>
        <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: 10, border: 0, background: C.soft, fontSize: 18, cursor: 'pointer', color: C.ink2 }}>
          ×
        </button>
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 4, background: '#EDEAF1', padding: 4, borderRadius: 12, marginTop: 14, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {(
          [
            ['equipo', 'Equipo'],
            ['ajustes', 'Ajustes'],
            ['actividad', 'Actividad'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            style={{ border: 0, borderRadius: 9, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: tab === k ? '#fff' : 'transparent', color: tab === k ? C.purple : C.ink2, boxShadow: tab === k ? '0 1px 3px rgba(30,26,36,.12)' : 'none' }}
          >
            {l}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        {tab === 'equipo' && <TeamTab me={me} onChanged={onChanged} notify={notify} />}
        {tab === 'ajustes' && <SettingsTab settings={settings} onChanged={onChanged} notify={notify} />}
        {tab === 'actividad' && <AuditTab />}
      </div>
    </Modal>
  );
}

function errText(e: unknown): string {
  if (e instanceof ApiError) return [e.message, ...Object.values(e.fields)].join(' ');
  return 'Ocurrió un error inesperado.';
}

function TeamTab({ me, onChanged, notify }: { me: UserDTO; onChanged: () => void; notify: (m: string) => void }) {
  const [users, setUsers] = useState<UserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'member' as Role, jobTitle: 'Colaborador', password: '' });
  const [formErr, setFormErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetErr, setResetErr] = useState<string | null>(null);
  const load = (): void => {
    api
      .users()
      .then((r) => setUsers(r.users))
      .catch((e: unknown) => setError(errText(e)));
  };
  useEffect(load, []);

  const update = async (u: UserDTO, body: Partial<{ role: Role; inTeam: boolean; active: boolean }>): Promise<void> => {
    try {
      const nu = await api.updateUser(u.id, body);
      setUsers((list) => (list ? list.map((x) => (x.id === nu.id ? nu : x)) : list));
      onChanged();
      notify(`Se actualizó a ${nu.firstName}`);
    } catch (e) {
      setError(errText(e));
    }
  };

  const resetPassword = async (u: UserDTO): Promise<void> => {
    const prob = passwordProblems(resetPw);
    if (prob) {
      setResetErr(prob);
      return;
    }
    try {
      await api.updateUser(u.id, { password: resetPw });
      setResetFor(null);
      setResetPw('');
      setResetErr(null);
      notify(`Se restableció la contraseña de ${u.firstName}. Sus sesiones abiertas se cerraron.`);
    } catch (e) {
      setResetErr(errText(e));
    }
  };

  const create = async (): Promise<void> => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Escribe el nombre (mínimo 2 caracteres).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Correo electrónico inválido.';
    const pw = passwordProblems(form.password);
    if (pw) e.password = pw;
    setFormErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const u = await api.createUser({ name: form.name.trim(), email: form.email.trim(), role: form.role, jobTitle: form.jobTitle.trim(), inTeam: form.role === 'member', password: form.password });
      setUsers((list) => [...(list ?? []), u]);
      setForm({ name: '', email: '', role: 'member', jobTitle: 'Colaborador', password: '' });
      onChanged();
      notify(`${u.firstName} se agregó al equipo`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFormErr(err.fields);
      else setFormErr({ form: errText(err) });
    } finally {
      setSaving(false);
    }
  };

  if (!users) return error ? <FieldError>{error}</FieldError> : <Spinner />;
  return (
    <div>
      {error && <FieldError>{error}</FieldError>}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {users.map((u, i) => (
          <div key={u.id} data-testid="admin-user" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? `1px solid ${C.line2}` : undefined, flexWrap: 'wrap', opacity: u.active ? 1 : 0.6 }}>
            <Avatar user={u} size={32} ring={false} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700 }}>
                {u.name} {u.id === me.id && <span style={{ fontSize: 11, color: C.muted }}>(tú)</span>}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>{u.email}</div>
            </div>
            <select aria-label={`Rol de ${u.name}`} value={u.role} onChange={(e) => void update(u, { role: e.target.value as Role })} style={{ ...inputStyle, width: 'auto' }}>
              <option value="member">{ROLE_LABELS.member}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.ink2 }}>
              <input type="checkbox" checked={u.inTeam} onChange={(e) => void update(u, { inTeam: e.target.checked })} /> En el equipo
            </label>
            {u.id !== me.id && (
              <button
                onClick={() => {
                  setResetFor(resetFor === u.id ? null : u.id);
                  setResetPw('');
                  setResetErr(null);
                }}
                aria-expanded={resetFor === u.id}
                style={{ ...secondaryBtn, padding: '7px 12px', fontSize: 12 }}
              >
                Contraseña
              </button>
            )}
            <button disabled={u.id === me.id} onClick={() => void update(u, { active: !u.active })} style={{ ...secondaryBtn, padding: '7px 12px', fontSize: 12, color: u.active ? C.pinkDark : C.greenDark }}>
              {u.active ? 'Desactivar' : 'Reactivar'}
            </button>
            {resetFor === u.id && (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void resetPassword(u);
                }}
                style={{ flexBasis: '100%', display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', paddingLeft: 42 }}
              >
                <div style={{ flex: '1 1 220px' }}>
                  <label htmlFor={`rp-${u.id}`} className="sr-only">
                    Nueva contraseña para {u.name}
                  </label>
                  <input id={`rp-${u.id}`} type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={resetPw} onChange={(e) => setResetPw(e.target.value)} style={inputStyle} />
                  <FieldError>{resetErr}</FieldError>
                </div>
                <button type="submit" className="hv-primary" style={{ ...primaryBtn, padding: '9px 14px', fontSize: 13 }}>
                  Restablecer
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        style={{ marginTop: 18, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 14 }}
      >
        <h3 style={{ fontFamily: LEXEND, fontWeight: 600, fontSize: 15, margin: '0 0 10px' }}>Agregar persona</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          {(
            [
              ['name', 'Nombre', 'text', LIMITS.userName, 'off'],
              ['email', 'Correo', 'email', LIMITS.email, 'off'],
              ['jobTitle', 'Cargo', 'text', LIMITS.jobTitle, 'off'],
              ['password', 'Contraseña inicial', 'password', LIMITS.passwordMax, 'new-password'],
            ] as const
          ).map(([k, l, type, max, ac]) => (
            <div key={k}>
              <label htmlFor={`nu-${k}`} style={labelStyle}>
                {l}
              </label>
              <input id={`nu-${k}`} type={type} maxLength={max} autoComplete={ac} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ ...inputStyle, marginTop: 4 }} />
              <FieldError>{formErr[k]}</FieldError>
            </div>
          ))}
          <div>
            <label htmlFor="nu-role" style={labelStyle}>
              Rol
            </label>
            <select id="nu-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} style={{ ...inputStyle, marginTop: 4 }}>
              <option value="member">{ROLE_LABELS.member}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
          </div>
        </div>
        <FieldError>{formErr.form}</FieldError>
        <button type="submit" className="hv-primary" disabled={saving} style={{ ...primaryBtn, marginTop: 12 }}>
          {saving ? 'Agregando…' : 'Agregar persona'}
        </button>
      </form>
    </div>
  );
}

function SettingsTab({ settings, onChanged, notify }: { settings: SettingsDTO; onChanged: () => void; notify: (m: string) => void }) {
  const [cap, setCap] = useState(String(settings.capacityHours));
  const [view, setView] = useState<ViewMode>(settings.defaultView);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (): Promise<void> => {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < LIMITS.capacityMin || n > LIMITS.capacityMax) {
      setErr(`La capacidad debe ser un número entero entre ${LIMITS.capacityMin} y ${LIMITS.capacityMax} horas.`);
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await api.updateSettings({ capacityHours: n, defaultView: view });
      onChanged();
      notify('Ajustes guardados');
    } catch (e) {
      setErr(errText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      style={{ display: 'grid', gap: 14, maxWidth: 380 }}
    >
      <div>
        <label htmlFor="set-cap" style={labelStyle}>
          Capacidad semanal por persona (horas)
        </label>
        <input id="set-cap" type="number" min={LIMITS.capacityMin} max={LIMITS.capacityMax} value={cap} onChange={(e) => setCap(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
      </div>
      <div>
        <label htmlFor="set-view" style={labelStyle}>
          Vista inicial
        </label>
        <select id="set-view" value={view} onChange={(e) => setView(e.target.value as ViewMode)} style={{ ...inputStyle, marginTop: 4 }}>
          <option value="lista">Lista</option>
          <option value="tablero">Tablero</option>
          <option value="carga">Carga del equipo</option>
        </select>
      </div>
      <FieldError>{err}</FieldError>
      <button type="submit" className="hv-primary" disabled={saving} style={{ ...primaryBtn, width: 'fit-content' }}>
        {saving ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </form>
  );
}

function AuditTab() {
  const PAGE = 15;
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<AuditEntryDTO> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setPage(null);
    api
      .audit(PAGE, offset)
      .then(setPage)
      .catch((e: unknown) => setErr(errText(e)));
  }, [offset]);
  if (err) return <FieldError>{err}</FieldError>;
  if (!page) return <Spinner />;
  const from = page.total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, page.total);
  return (
    <div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {page.items.map((a, i) => (
          <li key={a.id} data-testid="audit-item" style={{ padding: '9px 12px', borderTop: i ? `1px solid ${C.line2}` : undefined, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ color: C.muted, fontVariantNumeric: 'tabular-nums', minWidth: 130 }}>{new Date(a.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <b>{a.userName ?? 'Sistema'}</b>
            <span>{ACTION_LABELS[a.action] ?? a.action}</span>
          </li>
        ))}
        {!page.items.length && <li style={{ padding: 12, color: C.muted }}>Aún no hay actividad.</li>}
      </ul>
      <nav aria-label="Paginación de actividad" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} style={{ ...secondaryBtn, padding: '7px 12px' }}>
          ‹ Anterior
        </button>
        <span style={{ fontSize: 12, color: C.muted }}>
          {from}–{to} de {page.total}
        </span>
        <button disabled={offset + PAGE >= page.total} onClick={() => setOffset(offset + PAGE)} style={{ ...secondaryBtn, padding: '7px 12px' }}>
          Siguiente ›
        </button>
      </nav>
    </div>
  );
}
