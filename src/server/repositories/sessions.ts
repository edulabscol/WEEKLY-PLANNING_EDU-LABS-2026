import type { Database } from '../db/database.ts';

export interface SessionRecord {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: string;
  lastSeenAt: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  csrf_token: string;
  expires_at: string;
  last_seen_at: string;
}

export class SessionsRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async insert(s: { id: string; userId: string; csrfToken: string; expiresAt: string; ip: string | null; userAgent: string | null }, now: string): Promise<void> {
    await this.#db.run(
      `INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at, last_seen_at, ip, user_agent)
       VALUES ($id, $userId, $csrf, $now, $expiresAt, $now, $ip, $ua)`,
      { id: s.id, userId: s.userId, csrf: s.csrfToken, expiresAt: s.expiresAt, ip: s.ip?.slice(0, 64) ?? null, ua: s.userAgent, now },
    );
  }

  async findValid(id: string, now: string): Promise<SessionRecord | undefined> {
    const r = await this.#db.get<SessionRow>('SELECT id, user_id, csrf_token, expires_at, last_seen_at FROM sessions WHERE id = $id AND expires_at > $now', { id, now });
    return r ? { id: r.id, userId: r.user_id, csrfToken: r.csrf_token, expiresAt: r.expires_at, lastSeenAt: r.last_seen_at } : undefined;
  }

  async touch(id: string, now: string, expiresAt: string): Promise<void> {
    await this.#db.run('UPDATE sessions SET last_seen_at = $now, expires_at = $expiresAt WHERE id = $id', { id, now, expiresAt });
  }

  async delete(id: string): Promise<void> {
    await this.#db.run('DELETE FROM sessions WHERE id = $id', { id });
  }

  async deleteByUser(userId: string, exceptId: string | null = null): Promise<number> {
    return (await this.#db.run('DELETE FROM sessions WHERE user_id = $userId AND id IS DISTINCT FROM $except', { userId, except: exceptId })).changes;
  }

  async deleteExpired(now: string): Promise<number> {
    return (await this.#db.run('DELETE FROM sessions WHERE expires_at <= $now', { now })).changes;
  }
}
