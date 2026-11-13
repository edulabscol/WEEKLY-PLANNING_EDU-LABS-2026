/** Limitador de ventana fija en memoria (adecuado para una sola instancia). */
export class RateLimiter {
  readonly #hits = new Map<string, { count: number; resetAt: number }>();
  readonly #max: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #timer: NodeJS.Timeout;

  constructor(opts: { max: number; windowMs: number; now?: () => number }) {
    this.#max = opts.max;
    this.#windowMs = opts.windowMs;
    this.#now = opts.now ?? Date.now;
    this.#timer = setInterval(() => this.prune(), Math.min(opts.windowMs, 60_000));
    this.#timer.unref();
  }

  /** Registra un intento. Devuelve false si se superó el límite. */
  hit(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.#now();
    let entry = this.#hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.#windowMs };
      this.#hits.set(key, entry);
    }
    entry.count++;
    return { allowed: entry.count <= this.#max, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  reset(key: string): void {
    this.#hits.delete(key);
  }

  prune(): void {
    const now = this.#now();
    for (const [k, v] of this.#hits) if (v.resetAt <= now) this.#hits.delete(k);
  }

  stop(): void {
    clearInterval(this.#timer);
  }
}
