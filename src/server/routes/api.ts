import type { BootstrapDTO } from '../../shared/types.ts';
import {
  addTimeSchema,
  changePasswordSchema,
  createTaskSchema,
  createUserSchema,
  createWeekSchema,
  type Result,
  loginSchema,
  settingsSchema,
  startTimerSchema,
  updateTaskSchema,
  updateUserSchema,
  upsertAssigneeSchema,
} from '../../shared/validation.ts';
import { isValidWeekId } from '../../shared/weeks.ts';
import { badRequest, forbidden, tooManyRequests, validationError } from '../http/errors.ts';
import type { RateLimiter } from '../http/rate-limit.ts';
import { Router, type RequestContext } from '../http/router.ts';
import { SESSION_COOKIE } from '../http/util.ts';
import { toPublicUser } from '../repositories/users.ts';
import { requireAdmin, type SettingsService, type UsersService } from '../services/admin.ts';
import type { AuthService } from '../services/auth.ts';
import { isAdmin, type ServiceContext } from '../services/context.ts';
import type { TasksService, WeeksService } from '../services/planner.ts';

export interface Services {
  ctx: ServiceContext;
  auth: AuthService;
  weeks: WeeksService;
  tasks: TasksService;
  settings: SettingsService;
  users: UsersService;
  loginLimiter: RateLimiter;
  version: string;
}

function parse<T>(r: Result<T>): T {
  if (!r.ok) throw validationError(r.errors);
  return r.value;
}

function weekParam(c: RequestContext): string {
  const id = c.params.weekId ?? '';
  if (!isValidWeekId(id)) throw badRequest('Semana inválida.');
  return id;
}

function intQuery(c: RequestContext, key: string, def: number): number {
  const raw = c.query.get(key);
  if (raw === null) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`Parámetro ${key} inválido.`);
  return n;
}

export function buildApiRouter(s: Services): Router {
  const r = new Router();
  const { ctx } = s;

  // ------------------------------------------------------------ salud y sesión
  r.add(
    'GET',
    '/api/health',
    async () => {
      await ctx.db.get('SELECT 1 AS ok');
      return { body: { status: 'ok', db: 'ok', version: s.version, time: ctx.nowIso() } };
    },
    { public: true },
  );

  r.add(
    'POST',
    '/api/auth/login',
    async (c) => {
      const input = parse(loginSchema.parse(c.body));
      const key = `${c.ip ?? 'unknown'}|${input.email}`;
      const limit = s.loginLimiter.hit(key);
      if (!limit.allowed) {
        c.res.setHeader('Retry-After', String(limit.retryAfterSeconds));
        throw tooManyRequests('Demasiados intentos de inicio de sesión. Espera unos minutos.');
      }
      const result = await s.auth.login(input.email, input.password, { ip: c.ip, userAgent: c.req.headers['user-agent'] ?? null });
      s.loginLimiter.reset(key);
      c.setCookie(SESSION_COOKIE, result.token, { maxAgeSeconds: ctx.config.sessionTtlHours * 3600 });
      return { body: { user: toPublicUser(result.user), csrfToken: result.session.csrfToken } };
    },
    { public: true },
  );

  r.add('GET', '/api/auth/session', async (c) => ({ body: { authenticated: !!c.auth } }), { public: true });

  r.add('POST', '/api/auth/logout', async (c) => {
    const actor = c.actor();
    if (c.auth) await s.auth.logout(c.auth.session.id, actor);
    c.setCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0 });
    return { status: 204 };
  });

  r.add('POST', '/api/auth/password', async (c) => {
    const actor = c.actor();
    const input = parse(changePasswordSchema.parse(c.body));
    await s.auth.changePassword(actor, c.auth?.session.id ?? '', input.currentPassword, input.newPassword);
    return { status: 204 };
  });

  r.add('GET', '/api/bootstrap', async (c) => {
    const actor = c.actor();
    const body: BootstrapDTO = {
      user: toPublicUser(actor.user),
      csrfToken: c.auth?.session.csrfToken ?? '',
      today: ctx.today(),
      serverNow: ctx.nowIso(),
      currentWeekId: s.weeks.currentWeekId(),
      settings: await s.settings.get(),
      team: await s.users.team(),
      weeks: await s.weeks.listIds(),
      timer: await s.tasks.getTimer(actor),
    };
    return { body };
  });

  // ------------------------------------------------------------ semanas
  r.add('GET', '/api/weeks', async (c) => {
    c.actor();
    return { body: { weeks: await s.weeks.listIds(), currentWeekId: s.weeks.currentWeekId() } };
  });

  r.add('GET', '/api/weeks/:weekId', async (c) => ({ body: await s.weeks.getWeek(weekParam(c), c.actor()) }));

  r.add('POST', '/api/weeks', async (c) => {
    const actor = c.actor();
    if (!isAdmin(actor)) throw forbidden('Solo Coordinación puede crear el tablero de la semana.');
    const input = parse(createWeekSchema.parse(c.body));
    return { status: 201, body: await s.weeks.createWeek(input.weekId, input.carry, actor) };
  });

  // ------------------------------------------------------------ tareas
  r.add('POST', '/api/weeks/:weekId/tasks', async (c) => {
    const actor = c.actor();
    const input = parse(createTaskSchema.parse(c.body));
    return { status: 201, body: await s.tasks.create(weekParam(c), input, actor) };
  });

  r.add('PATCH', '/api/tasks/:id', async (c) => {
    const actor = c.actor();
    return { body: await s.tasks.update(c.params.id ?? '', parse(updateTaskSchema.parse(c.body)), actor) };
  });

  r.add('DELETE', '/api/tasks/:id', async (c) => {
    await s.tasks.delete(c.params.id ?? '', c.actor());
    return { status: 204 };
  });

  r.add('POST', '/api/tasks/:id/restore', async (c) => ({ body: await s.tasks.restore(c.params.id ?? '', c.actor()) }));

  r.add('PUT', '/api/tasks/:id/assignees/:userId', async (c) => {
    const actor = c.actor();
    const input = parse(upsertAssigneeSchema.parse(c.body ?? {}));
    return { body: await s.tasks.upsertAssignee(c.params.id ?? '', c.params.userId ?? '', input, actor) };
  });

  r.add('DELETE', '/api/tasks/:id/assignees/:userId', async (c) => ({ body: await s.tasks.removeAssignee(c.params.id ?? '', c.params.userId ?? '', c.actor()) }));

  r.add('POST', '/api/tasks/:id/time', async (c) => {
    const actor = c.actor();
    return { body: await s.tasks.addTime(c.params.id ?? '', parse(addTimeSchema.parse(c.body)), actor) };
  });

  // ------------------------------------------------------------ cronómetro
  r.add('GET', '/api/timer', async (c) => ({ body: { timer: await s.tasks.getTimer(c.actor()) } }));

  r.add('POST', '/api/timer/start', async (c) => {
    const actor = c.actor();
    const input = parse(startTimerSchema.parse(c.body));
    return { status: 201, body: await s.tasks.startTimer(input.taskId, input.userId, actor) };
  });

  r.add('POST', '/api/timer/stop', async (c) => ({ body: await s.tasks.stopTimer(c.actor()) }));

  // ------------------------------------------------------------ equipo y ajustes
  r.add('GET', '/api/settings', async (c) => {
    c.actor();
    return { body: await s.settings.get() };
  });

  r.add('PUT', '/api/settings', async (c) => {
    const actor = c.actor();
    requireAdmin(actor);
    return { body: await s.settings.update(parse(settingsSchema.parse(c.body)), actor) };
  });

  r.add('GET', '/api/users', async (c) => ({ body: { users: await s.users.list(c.actor()) } }));

  r.add('POST', '/api/users', async (c) => {
    const actor = c.actor();
    requireAdmin(actor);
    const input = parse(createUserSchema.parse(c.body));
    return { status: 201, body: await s.users.create(input, actor) };
  });

  r.add('PATCH', '/api/users/:id', async (c) => {
    const actor = c.actor();
    requireAdmin(actor);
    const input = parse(updateUserSchema.parse(c.body));
    return { body: await s.users.update(c.params.id ?? '', input, actor) };
  });

  r.add('GET', '/api/audit', async (c) => {
    const actor = c.actor();
    requireAdmin(actor);
    return { body: await s.users.audit(actor, intQuery(c, 'limit', 25), intQuery(c, 'offset', 0)) };
  });

  return r;
}
