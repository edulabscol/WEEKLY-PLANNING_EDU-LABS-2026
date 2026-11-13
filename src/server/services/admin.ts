import { randomUUID } from 'node:crypto';
import { AVATAR_COLORS, LIMITS, VIEW_MODES } from '../../shared/constants.ts';
import type { AuditEntryDTO, Page, SettingsDTO, UserDTO, ViewMode } from '../../shared/types.ts';
import type { createUserSchema, Infer, settingsSchema, updateUserSchema } from '../../shared/validation.ts';
import { conflict, forbidden, notFound, unprocessable } from '../http/errors.ts';
import { toPublicUser } from '../repositories/users.ts';
import { type Actor, isAdmin, type ServiceContext } from './context.ts';
import { hashPassword } from './passwords.ts';

export const DEFAULT_SETTINGS: SettingsDTO = { capacityHours: 40, defaultView: 'lista' };

export function requireAdmin(actor: Actor): void {
  if (!isAdmin(actor)) throw forbidden('Solo Coordinación puede administrar el equipo y los ajustes.');
}

export class SettingsService {
  readonly #ctx: ServiceContext;
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx;
  }

  async get(): Promise<SettingsDTO> {
    const raw = await this.#ctx.settings.getAll();
    const cap = Number(raw.capacityHours);
    const view = raw.defaultView as ViewMode | undefined;
    return {
      capacityHours: Number.isInteger(cap) && cap >= LIMITS.capacityMin && cap <= LIMITS.capacityMax ? cap : DEFAULT_SETTINGS.capacityHours,
      defaultView: view && VIEW_MODES.includes(view) ? view : DEFAULT_SETTINGS.defaultView,
    };
  }

  async update(input: Infer<typeof settingsSchema>, actor: Actor): Promise<SettingsDTO> {
    requireAdmin(actor);
    const ctx = this.#ctx;
    await ctx.db.transaction(async () => {
      const now = ctx.nowIso();
      if (input.capacityHours !== undefined) await ctx.settings.set('capacityHours', String(input.capacityHours), now);
      if (input.defaultView !== undefined) await ctx.settings.set('defaultView', input.defaultView, now);
      await ctx.record({ userId: actor.user.id, action: 'settings.update', entity: 'settings', entityId: null, details: { ...input }, ip: actor.ip });
    });
    return this.get();
  }
}

export class UsersService {
  readonly #ctx: ServiceContext;
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx;
  }

  async team(): Promise<UserDTO[]> {
    return (await this.#ctx.users.listTeam()).map(toPublicUser);
  }

  async list(actor: Actor): Promise<UserDTO[]> {
    return isAdmin(actor) ? (await this.#ctx.users.listAll()).map(toPublicUser) : this.team();
  }

  async create(input: Infer<typeof createUserSchema>, actor: Actor | null): Promise<UserDTO> {
    if (actor) requireAdmin(actor);
    const ctx = this.#ctx;
    if (await ctx.users.findByEmail(input.email)) throw conflict('Ya existe una persona con ese correo.');
    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();
    const color = input.color ?? AVATAR_COLORS[(await ctx.users.count()) % AVATAR_COLORS.length] ?? '#5E1A8C';
    await ctx.db.transaction(async () => {
      await ctx.users.insert({ id, email: input.email, name: input.name, color, role: input.role, jobTitle: input.jobTitle ?? (input.role === 'admin' ? 'Coordinación' : 'Colaborador'), inTeam: input.inTeam ?? input.role === 'member', passwordHash }, ctx.nowIso());
      await ctx.record({ userId: actor?.user.id ?? null, action: 'user.create', entity: 'user', entityId: id, details: { email: input.email, role: input.role }, ip: actor?.ip ?? null });
    });
    const created = await ctx.users.findById(id);
    if (!created) throw new Error('No se pudo crear el usuario.');
    return toPublicUser(created);
  }

  async update(id: string, input: Infer<typeof updateUserSchema>, actor: Actor): Promise<UserDTO> {
    requireAdmin(actor);
    const ctx = this.#ctx;
    const target = await ctx.users.findById(id);
    if (!target) throw notFound('La persona no existe.');
    const losesAdmin = target.role === 'admin' && target.active && (input.role === 'member' || input.active === false);
    if (losesAdmin && (await ctx.users.countActiveAdmins()) <= 1) throw unprocessable('Debe existir al menos una persona activa con rol Coordinación.');
    if (id === actor.user.id && input.active === false) throw unprocessable('No puedes desactivar tu propia cuenta.');
    const { password, ...rest } = input;
    const passwordHash = password ? await hashPassword(password) : undefined;
    await ctx.db.transaction(async () => {
      await ctx.users.update(id, { ...rest, ...(passwordHash ? { passwordHash } : {}) }, ctx.nowIso());
      if (input.active === false || passwordHash) await ctx.sessions.deleteByUser(id);
      if (passwordHash) await ctx.users.resetFailedLogins(id);
      await ctx.record({ userId: actor.user.id, action: 'user.update', entity: 'user', entityId: id, details: { fields: Object.keys(input) }, ip: actor.ip });
    });
    const updated = await ctx.users.findById(id);
    if (!updated) throw notFound('La persona no existe.');
    return toPublicUser(updated);
  }

  async audit(actor: Actor, limit: number, offset: number): Promise<Page<AuditEntryDTO>> {
    requireAdmin(actor);
    const l = Math.min(Math.max(1, limit), 100);
    const o = Math.max(0, offset);
    const { items, total } = await this.#ctx.audit.list(l, o);
    return { items, total, limit: l, offset: o };
  }
}
