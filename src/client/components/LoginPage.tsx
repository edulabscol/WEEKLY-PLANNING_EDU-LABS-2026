import { useState } from 'react';
import { api, ApiError } from '../lib/api.ts';
import { BrandStripe, Logo } from './Header.tsx';
import { C, FieldError, inputStyle, labelStyle, LEXEND, primaryBtn } from './ui.tsx';

export function LoginPage({ onLoggedIn, notice }: { onLoggedIn: () => void; notice: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    const e: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Escribe un correo electrónico válido.';
    if (!password) e.password = 'Escribe tu contraseña.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      await api.login(email.trim(), password);
      onLoggedIn();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.' });
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#fff', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 24px', maxWidth: 1440, margin: '0 auto' }}>
          <Logo />
          <div style={{ width: 1, height: 26, background: C.line }} />
          <div style={{ fontFamily: LEXEND, fontWeight: 500, fontSize: 15, color: C.ink2 }}>Planeación semanal</div>
        </div>
        <BrandStripe />
      </header>
      <main style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
        <form
          noValidate
          aria-labelledby="login-title"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, animation: 'elin .3s ease' }}
        >
          <h1 id="login-title" style={{ fontFamily: LEXEND, fontSize: 24, fontWeight: 600, margin: 0 }}>
            Inicia sesión
          </h1>
          <p style={{ color: C.muted, margin: '6px 0 20px', lineHeight: 1.5 }}>Planea la semana, registra tu tiempo y revisa la carga del equipo.</p>
          {notice && (
            <div role="status" style={{ background: '#FFF5D6', color: '#7A5A00', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
              {notice}
            </div>
          )}
          <label htmlFor="login-email" style={labelStyle}>
            Correo
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'login-email-err' : undefined}
            style={{ ...inputStyle, marginTop: 4, fontSize: 14, padding: '11px 12px' }}
          />
          <FieldError id="login-email-err">{errors.email}</FieldError>
          <div style={{ height: 14 }} />
          <label htmlFor="login-password" style={labelStyle}>
            Contraseña
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'login-password-err' : undefined}
            style={{ ...inputStyle, marginTop: 4, fontSize: 14, padding: '11px 12px' }}
          />
          <FieldError id="login-password-err">{errors.password}</FieldError>
          <FieldError>{errors.form}</FieldError>
          <button type="submit" className="hv-primary" disabled={submitting} style={{ ...primaryBtn, width: '100%', marginTop: 20, padding: '12px 18px', fontSize: 15 }}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </main>
    </div>
  );
}
