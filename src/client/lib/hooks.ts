import { useCallback, useEffect, useRef, useState } from 'react';

export function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = (): void => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** Re-renderiza cada segundo mientras active sea verdadero. */
export function useTick(active: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  return n;
}

/**
 * Devuelve una función que ejecuta fn tras `ms` sin nuevas llamadas,
 * y un flush() para ejecutar de inmediato lo pendiente (p. ej. al cerrar).
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number): { call: (...args: A) => void; flush: () => void; cancel: () => void } {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const args = pending.current;
    pending.current = null;
    if (args) fnRef.current(...args);
  }, []);
  const call = useCallback(
    (...args: A) => {
      pending.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [ms, flush],
  );
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);
  useEffect(() => () => flush(), [flush]);
  return { call, flush, cancel };
}
