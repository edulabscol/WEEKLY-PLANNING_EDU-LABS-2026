import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Actor } from '../services/context.ts';
import type { AuthResult } from '../services/auth.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  ip: string | null;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  auth: AuthResult | null;
  /** Devuelve el usuario autenticado o lanza 401. */
  actor(): Actor;
  setCookie(name: string, value: string, opts: { maxAgeSeconds: number }): void;
}

export interface Reply {
  status?: number;
  body?: unknown;
}

export type Handler = (ctx: RequestContext) => Reply | Promise<Reply>;

interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  /** Rutas públicas no exigen sesión ni CSRF. */
  public: boolean;
}

export class Router {
  readonly #routes: Route[] = [];

  add(method: Method, path: string, handler: Handler, opts: { public?: boolean } = {}): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_m, k: string) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '/?$',
    );
    this.#routes.push({ method, pattern, keys, handler, public: opts.public ?? false });
    return this;
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | { allowed: Method[] } | null {
    const allowed: Method[] = [];
    for (const route of this.#routes) {
      const m = route.pattern.exec(path);
      if (!m) continue;
      if (route.method !== method) {
        allowed.push(route.method);
        continue;
      }
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1] ?? '');
      });
      return { route, params };
    }
    return allowed.length ? { allowed } : null;
  }
}
