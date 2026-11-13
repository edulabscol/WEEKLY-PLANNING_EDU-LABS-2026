import { firstNameOf, initialsOf } from '../../shared/rules.ts';
import type { Role, UserDTO } from '../../shared/types.ts';
import { isUuid } from '../../shared/validation.ts';
import type { Database } from '../db/database.ts';

interface UserRow {
  id: string;
  email: string;
  name: string;
  color: string;
  role: Role;
  job_title: string;
  in_team: boolean | number;
  active: boolean | number;
  password_hash: string;
  failed_logins: number;
  locked_until: string | null;
}

export interface UserRecord extends UserDTO {
  passwordHash: string;
  failedLogins: number;
  lockedUntil: string | null;
}

function toRecord(r: UserRow): UserRecord {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    firstName: firstNameOf(r.name),
    initials: initialsOf(r.name),
    color: r.color,
    role: r.role,
    jobTitle: r.job_title,
    inTeam: Boolean(r.in_team),
    active: Boolean(r.active),
    passwordHash: r.password_hash,
    failedLogins: r.failed_logins,
    lockedUntil: r.locked_until,
  };
}

export function toPublicUser(u: UserRecord): UserDTO {
  const { passwordHash: _p, failedLogins: _f, lockedUntil: _l, ...pub } = u;
  return pub;
}

export interface NewUser {
  id: string;
  email: string;
  name: string;
  color: string;
  role: Role;
  jobTitle: string;
  inTeam: boolean;
  passwordHash: string;
}

export interface UserChanges {
  name?: string;
  color?: string;
  role?: Role;
  jobTitle?: string;
  inTeam?: boolean;
  active?: boolean;
  passwordHash?: string;
}

const COLUMNS: Record<keyof UserChanges, string> = { name: 'name', color: 'color', role: 'role', jobTitle: 'job_title', inTeam: 'in_team', active: 'active', passwordHash: 'password_hash' };

export class UsersRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    if (!isUuid(id)) return undefined;
    const r = await this.#db.get<UserRow>('SELECT * FROM users WHERE id = $id', { id });
    return r ? toRecord(r) : undefined;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const r = await this.#db.get<UserRow>('SELECT * FROM users WHERE email = lower($email)', { email });
    return r ? toRecord(r) : undefined;
  }

  async listAll(): Promise<UserRecord[]> {
    return (await this.#db.all<UserRow>('SELECT * FROM users ORDER BY active DESC, in_team DESC, seq')).map(toRecord);
  }

  /** Integrantes activos que aparecen en filtros, asignaciones y carga. */
  async listTeam(): Promise<UserRecord[]> {
    return (await this.#db.all<UserRow>('SELECT * FROM users WHERE active AND in_team ORDER BY seq')).map(toRecord);
  }

  async count(): Promise<number> {
    return (await this.#db.get<{ n: number }>('SELECT count(*) AS n FROM users'))?.n ?? 0;
  }

  async countActiveAdmins(): Promise<number> {
    return (await this.#db.get<{ n: number }>("SELECT count(*) AS n FROM users WHERE role = 'admin' AND active"))?.n ?? 0;
  }

  async insert(u: NewUser, now: string): Promise<void> {
    await this.#db.run(
      `INSERT INTO users (id, email, name, color, role, job_title, in_team, active, password_hash, created_at, updated_at)
       VALUES ($id, lower($email), $name, $color, $role, $jobTitle, $inTeam, true, $passwordHash, $now, $now)`,
      { id: u.id, email: u.email, name: u.name, color: u.color, role: u.role, jobTitle: u.jobTitle, inTeam: u.inTeam, passwordHash: u.passwordHash, now },
    );
  }

  async update(id: string, c: UserChanges, now: string): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, string | boolean> = { id, now };
    for (const [k, v] of Object.entries(c) as Array<[keyof UserChanges, UserChanges[keyof UserChanges]]>) {
      if (v === undefined) continue;
      sets.push(`${COLUMNS[k]} = $${k}`);
      params[k] = v;
    }
    if (!sets.length) return;
    await this.#db.run(`UPDATE users SET ${sets.join(', ')}, updated_at = $now WHERE id = $id`, params);
  }

  async recordFailedLogin(id: string, lockUntil: string | null): Promise<void> {
    await this.#db.run('UPDATE users SET failed_logins = failed_logins + 1, locked_until = COALESCE($lock, locked_until) WHERE id = $id', { id, lock: lockUntil });
  }

  async resetFailedLogins(id: string): Promise<void> {
    await this.#db.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $id', { id });
  }
}
