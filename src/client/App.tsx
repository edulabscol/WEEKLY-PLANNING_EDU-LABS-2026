import { useCallback, useEffect, useState } from 'react';
import type { BootstrapDTO } from '../shared/types.ts';
import { LoginPage } from './components/LoginPage.tsx';
import { PlannerPage } from './components/PlannerPage.tsx';
import { C, primaryBtn, Spinner } from './components/ui.tsx';
import { api, ApiError, setCsrfToken, setUnauthorizedHandler } from './lib/api.ts';

type State = { kind: 'loading' } | { kind: 'login'; notice: string | null } | { kind: 'ready'; boot: BootstrapDTO; session: number } | { kind: 'error'; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async (notice: string | null = null) => {
    try {
      const { authenticated } = await api.session();
      if (!authenticated) {
        setState({ kind: 'login', notice });
        return;
      }
      const boot = await api.bootstrap();
      setCsrfToken(boot.csrfToken);
      setState({ kind: 'ready', boot, session: Date.now() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ kind: 'login', notice });
      else setState({ kind: 'error', message: e instanceof ApiError ? e.message : 'No se pudo cargar la aplicación.' });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ kind: 'login', notice: 'Tu sesión expiró. Vuelve a iniciar sesión.' }));
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // La sesión ya pudo haber expirado; igualmente se vuelve al inicio de sesión.
    }
    setCsrfToken('');
    setState({ kind: 'login', notice: null });
  }, []);

  if (state.kind === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg }}>
        <Spinner label="Cargando Planeación semanal…" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg, padding: 16 }}>
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, maxWidth: 420 }}>
          <div style={{ fontWeight: 800, color: C.pinkDark }}>No se pudo conectar</div>
          <p style={{ color: C.ink2 }}>{state.message}</p>
          <button className="hv-primary" style={primaryBtn} onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === 'login') return <LoginPage notice={state.notice} onLoggedIn={() => void load()} />;
  return <PlannerPage key={state.session} boot={state.boot} onLogout={() => void logout()} />;
}
