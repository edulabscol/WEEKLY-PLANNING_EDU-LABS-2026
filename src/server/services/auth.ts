import { createHash, randomBytes } from 'node:crypto';
import { unauthorized, validationError } from '../http/errors.ts';
import type { SessionRecord } from '../repositories/sessions.ts';
import type { UserRecord } from '../repositories/users.ts';
import type { Actor, ServiceContext } from './context.ts';
import { getDummyHash, hashPassword, verifyPassword } from './passwords.ts';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const TOUCH_INTERVAL_MS = 5 * 60_000;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface AuthResult {
  user: UserRecord;
  session: SessionRecord;
}

export class AuthService {
  readonly #ctx: ServiceContext;
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx;
  }

  #expiry(from: Date): string {
    return new Date(from.getTime() + this.#ctx.config.sessionTtlHours * 3600_000).toISOString();
  }

  /** Verifica credenciales y crea una sesión. Devuelve el token en claro (solo para la cookie). */
  async login(email: string, password: string, meta: { ip: string | null; userAgent: string | null }): Promise<AuthResult & { token: string }> {
    const ctx = this.#ctx;
    const user = await ctx.users.findByEmail(email);
    const now = ctx.clock.now();
    const fail = (): never => {
      throw unauthorized('Correo o contraseña incorrectos.');
    };
    if (!user) {
      await verifyPassword(password, await getDummyHash());
      await ctx.record({ userId: null, action: 'auth.login_failed', entity: 'user', entityId: null, details: { reason: 'unknown_email' }, ip: meta.ip });
      return fail();
    }
    if (user.lockedUntil && user.lockedUntil > now.toISOString()) {
      await ctx.record({ userId: user.id, action: 'auth.login_locked', entity: 'user', entityId: user.id, ip: meta.ip });
      throw unauthorized(`Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${LOCK_MINUTES} minutos.`);
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok || !user.active) {
      if (!ok) {
        const lock = user.failedLogins + 1 >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null;
        await ctx.users.recordFailedLogin(user.id, lock);
      }
      await ctx.record({ userId: user.id, action: 'auth.login_failed', entity: 'user', entityId: user.id, details: { reason: ok ? 'inactive' : 'bad_password' }, ip: meta.ip });
      return fail();
    }
    await ctx.users.resetFailedLogins(user.id);
    const token = randomBytes(32).toString('base64url');
    const session: SessionRecord = {
      id: hashToken(token),
      userId: user.id,
      csrfToken: randomBytes(24).toString('base64url'),
      expiresAt: this.#expiry(now),
      lastSeenAt: now.toISOString(),
    };
    await ctx.sessions.insert({ ...session, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null }, now.toISOString());
    await ctx.sessions.deleteExpired(now.toISOString());
    await ctx.record({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip: meta.ip });
    return { token, user, session };
  }

  /** Resuelve la sesión a partir del token de la cookie (expiración deslizante). */
  async authenticate(token: string | undefined): Promise<AuthResult | null> {
    if (!token || token.length > 200) return null;
    const ctx = this.#ctx;
    const now = ctx.clock.now();
    const session = await ctx.sessions.findValid(hashToken(token), now.toISOString());
    if (!session) return null;
    const user = await ctx.users.findById(session.userId);
    if (!user || !user.active) {
      await ctx.sessions.delete(session.id);
      return null;
    }
    if (now.getTime() - new Date(session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
      const expiresAt = this.#expiry(now);
      await ctx.sessions.touch(session.id, now.toISOString(), expiresAt);
      session.expiresAt = expiresAt;
    }
    return { user, session };
  }

  async logout(sessionId: string, actor: Actor): Promise<void> {
    await this.#ctx.sessions.delete(sessionId);
    await this.#ctx.record({ userId: actor.user.id, action: 'auth.logout', entity: 'user', entityId: actor.user.id, ip: actor.ip });
  }

  async changePassword(actor: Actor, sessionId: string, currentPassword: string, newPassword: string): Promise<void> {
    const ok = await verifyPassword(currentPassword, actor.user.passwordHash);
    if (!ok) throw validationError({ currentPassword: 'La contraseña actual no es correcta.' });
    if (currentPassword === newPassword) throw validationError({ newPassword: 'La nueva contraseña debe ser diferente.' });
    const hash = await hashPassword(newPassword);
    await this.#ctx.db.transaction(async () => {
      await this.#ctx.users.update(actor.user.id, { passwordHash: hash }, this.#ctx.nowIso());
      await this.#ctx.sessions.deleteByUser(actor.user.id, sessionId);
      await this.#ctx.record({ userId: actor.user.id, action: 'auth.password_changed', entity: 'user', entityId: actor.user.id, ip: actor.ip });
    });
  }
}
