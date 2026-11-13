import { randomUUID } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Config } from './config.ts';
import type { Database } from './db/database.ts';
import { DatabaseError, DatabaseUnavailableError } from './db/errors.ts';
import { conflict, forbidden, HttpError, notFound, tooManyRequests, unauthorized, unprocessable } from './http/errors.ts';
import { RateLimiter } from './http/rate-limit.ts';
import type { RequestContext } from './http/router.ts';
import { serveStatic } from './http/static.ts';
import { clientIp, parseCookies, readJsonBody, securityHeaders, sendJson, serializeCookie, SESSION_COOKIE } from './http/util.ts';
import type { Logger } from './logger.ts';
import { buildApiRouter, type Services } from './routes/api.ts';
import { SettingsService, UsersService } from './services/admin.ts';
import { AuthService } from './services/auth.ts';
import { type Clock, ServiceContext, systemClock } from './services/context.ts';
import { TasksService, WeeksService } from './services/planner.ts';

export const APP_VERSION = '1.2.0';

/**
 * Red de seguridad: convierte violaciones de restricciones de la base de datos (PostgreSQL o SQLite) (p. ej. por concurrencia)
 * en respuestas HTTP comprensibles en lugar de un 500.
 */
export function mapDatabaseError(err: unknown): HttpError | null {
  if (!(err instanceof DatabaseError)) return null;
  switch (err.code) {
    case '23505':
      return conflict('El registro ya existe o fue modificado por otra persona. Recarga e intenta de nuevo.');
    case '23503':
      return unprocessable('El registro relacionado no existe o fue eliminado.');
    case '23514':
    case '22001':
      return unprocessable('Los datos no cumplen las reglas de la base de datos.');
    case '22P02':
      return new HttpError(400, 'bad_request', 'Identificador o valor con formato inválido.');
    case '40001':
    case '40P01':
      return conflict('Hubo un conflicto con otra operación simultánea. Intenta de nuevo.');
    case '57014':
      return new HttpError(503, 'timeout', 'La operación tardó demasiado. Intenta de nuevo.');
    default:
      return null;
  }
}
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface App {
  server: http.Server;
  services: Services;
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  close: () => Promise<void>;
}

export function createApp(db: Database, config: Config, logger: Logger, clock: Clock = systemClock): App {
  const ctx = new ServiceContext(db, config, logger, clock);
  const services: Services = {
    ctx,
    auth: new AuthService(ctx),
    weeks: new WeeksService(ctx),
    tasks: new TasksService(ctx),
    settings: new SettingsService(ctx),
    users: new UsersService(ctx),
    loginLimiter: new RateLimiter(config.loginRateLimit),
    version: APP_VERSION,
  };
  const apiLimiter = new RateLimiter(config.apiRateLimit);
  const router = buildApiRouter(services);

  /** Rechaza peticiones con Origin distinto al propio (o a la lista CORS permitida). */
  function originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (config.corsOrigins.includes(origin)) return true;
    const host = req.headers['x-forwarded-host'] && config.trustProxy ? String(req.headers['x-forwarded-host']) : req.headers.host;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  function applyCors(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
      res.setHeader('Vary', 'Origin');
    }
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, requestId: string, ip: string | null): Promise<string | null> {
    applyCors(req, res);
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.statusCode = originAllowed(req) ? 204 : 403;
      res.end();
      return null;
    }
    const limit = apiLimiter.hit(ip ?? 'unknown');
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw tooManyRequests();
    }
    const matched = router.match(method, url.pathname);
    if (!matched) throw notFound('Ruta de API inexistente.');
    if ('allowed' in matched) {
      res.setHeader('Allow', matched.allowed.join(', '));
      throw new HttpError(405, 'method_not_allowed', 'Método no permitido.');
    }
    const { route, params } = matched;
    const cookies = parseCookies(req.headers.cookie);
    const auth = await services.auth.authenticate(cookies[SESSION_COOKIE]);
    if (!SAFE_METHODS.has(method)) {
      if (!originAllowed(req)) throw forbidden('Origen no permitido.');
      if (!route.public) {
        if (!auth) throw unauthorized();
        const token = req.headers['x-csrf-token'];
        if (typeof token !== 'string' || token !== auth.session.csrfToken) throw forbidden('Token CSRF inválido. Recarga la página.');
      }
    }
    const body = await readJsonBody(req);
    const c: RequestContext = {
      req,
      res,
      requestId,
      ip,
      params,
      query: url.searchParams,
      body,
      auth,
      actor: () => {
        if (!auth) throw unauthorized();
        return { user: auth.user, ip };
      },
      setCookie: (name, value, opts) => {
        res.appendHeader('Set-Cookie', serializeCookie(name, value, { ...opts, secure: config.cookieSecure }));
      },
    };
    const reply = await route.handler(c);
    sendJson(res, reply.status ?? 200, reply.body);
    return auth?.user.id ?? null;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = process.hrtime.bigint();
    const requestId = randomUUID();
    const ip = clientIp(req, config.trustProxy);
    res.setHeader('X-Request-Id', requestId);
    securityHeaders(res, config);
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendJson(res, 400, { error: { code: 'bad_request', message: 'URL inválida.' } });
      return;
    }
    let userId: string | null = null;
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    try {
      if (isApi) userId = await handleApi(req, res, url, requestId, ip);
      else serveStatic(req, res, config.publicDir, url.pathname);
    } catch (err) {
      const mapped = err instanceof HttpError ? err : mapDatabaseError(err);
      if (mapped) {
        sendJson(res, mapped.status, { error: { code: mapped.code, message: mapped.message, ...(mapped.fields ? { fields: mapped.fields } : {}) } });
        if (!(err instanceof HttpError)) logger.warn('Restricción de base de datos', { requestId, code: (err as DatabaseError).code, constraint: (err as DatabaseError).constraint });
      } else if (err instanceof DatabaseUnavailableError) {
        logger.error('Base de datos no disponible', { requestId, err });
        sendJson(res, 503, { error: { code: 'database_unavailable', message: 'La base de datos no está disponible. Intenta de nuevo en unos minutos.', requestId } });
      } else {
        logger.error('Error no controlado', { requestId, err: err instanceof Error ? err : String(err) });
        sendJson(res, 500, { error: { code: 'internal_error', message: 'Ocurrió un error inesperado. Intenta de nuevo.', requestId } });
      }
    } finally {
      if (isApi) {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        logger.info('request', { requestId, method: req.method, path: url.pathname, status: res.statusCode, ms: Math.round(ms * 10) / 10, userId, ip });
      }
    }
  }

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;

  return {
    server,
    services,
    handle,
    close: () =>
      new Promise<void>((resolve) => {
        apiLimiter.stop();
        services.loginLimiter.stop();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
