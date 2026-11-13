import type { AuditEntryDTO, WeekDTO } from '../../shared/types.ts';
import type { Database } from '../db/database.ts';

// ------------------------------------------------------------------ ajustes

export class SettingsRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async getAll(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const r of await this.#db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) out[r.key] = r.value;
    return out;
  }

  async set(key: string, value: string, now: string): Promise<void> {
    await this.#db.run('INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at', {
      key,
      value,
      now,
    });
  }
}

// ------------------------------------------------------------------ semanas

interface WeekRow {
  id: string;
  iso_year: number;
  iso_week: number;
  monday: string;
  name: string;
  created_at: string;
}

const toWeek = (r: WeekRow): WeekDTO => ({ id: r.id, isoYear: r.iso_year, isoWeek: r.iso_week, monday: r.monday, name: r.name, createdAt: r.created_at });
const WEEK_COLS = 'id, iso_year, iso_week, monday, name, created_at';

/** Nombre por defecto del sprint n (0 = el primero). */
export const defaultSprintName = (n: number): string => `Sprint ${n}`;

export class WeeksRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async listIds(): Promise<string[]> {
    return (await this.#db.all<{ id: string }>('SELECT id FROM weeks ORDER BY monday')).map((r) => r.id);
  }

  /** Nombre de cada sprint, por id de semana. */
  async names(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const r of await this.#db.all<{ id: string; name: string }>('SELECT id, name FROM weeks ORDER BY monday')) out[r.id] = r.name;
    return out;
  }

  async count(): Promise<number> {
    return Number((await this.#db.get<{ n: number }>('SELECT count(*) AS n FROM weeks'))?.n ?? 0);
  }

  async rename(id: string, name: string): Promise<boolean> {
    return (await this.#db.run('UPDATE weeks SET name = $name WHERE id = $id', { id, name })).changes > 0;
  }

  async get(id: string): Promise<WeekDTO | undefined> {
    const r = await this.#db.get<WeekRow>(`SELECT ${WEEK_COLS} FROM weeks WHERE id = $id`, { id });
    return r ? toWeek(r) : undefined;
  }

  async latest(): Promise<WeekDTO | undefined> {
    const r = await this.#db.get<WeekRow>(`SELECT ${WEEK_COLS} FROM weeks ORDER BY monday DESC LIMIT 1`);
    return r ? toWeek(r) : undefined;
  }

  async latestBefore(monday: string): Promise<WeekDTO | undefined> {
    const r = await this.#db.get<WeekRow>(`SELECT ${WEEK_COLS} FROM weeks WHERE monday < $monday ORDER BY monday DESC LIMIT 1`, { monday });
    return r ? toWeek(r) : undefined;
  }

  /** Inserta el tablero; si no se da nombre, se numera como el siguiente sprint ("Sprint 0", "Sprint 1", …). */
  async insert(w: { id: string; isoYear: number; isoWeek: number; monday: string; createdBy: string | null; name?: string }, now: string): Promise<void> {
    const name = w.name ?? defaultSprintName(await this.count());
    await this.#db.run('INSERT INTO weeks (id, iso_year, iso_week, monday, name, created_by, created_at) VALUES ($id, $y, $w, $monday, $name, $by, $now)', {
      name,
      id: w.id,
      y: w.isoYear,
      w: w.isoWeek,
      monday: w.monday,
      by: w.createdBy,
      now,
    });
  }
}

// ------------------------------------------------------------------ auditoría

export interface AuditInput {
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export class AuditRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async insert(e: AuditInput, now: string): Promise<void> {
    await this.#db.run('INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip, created_at) VALUES ($u, $a, $e, $id, $d, $ip, $now)', {
      u: e.userId,
      a: e.action,
      e: e.entity,
      id: e.entityId,
      d: JSON.stringify(e.details ?? {}),
      ip: e.ip?.slice(0, 64) ?? null,
      now,
    });
  }

  async list(limit: number, offset: number): Promise<{ items: AuditEntryDTO[]; total: number }> {
    const total = (await this.#db.get<{ n: number }>('SELECT count(*) AS n FROM audit_log'))?.n ?? 0;
    const rows = await this.#db.all<{ id: number; user_id: string | null; user_name: string | null; action: string; entity: string; entity_id: string | null; details: string; created_at: string }>(
      `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity, a.entity_id, a.details, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT $limit OFFSET $offset`,
      { limit, offset },
    );
    return {
      total,
      items: rows.map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, action: r.action, entity: r.entity, entityId: r.entity_id, details: r.details, createdAt: r.created_at })),
    };
  }
}
