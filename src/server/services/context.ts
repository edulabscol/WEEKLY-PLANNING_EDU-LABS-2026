import type { Config } from '../config.ts';
import { today } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { Logger } from '../logger.ts';
import { AuditRepository, type AuditInput, SettingsRepository, WeeksRepository } from '../repositories/misc.ts';
import { SessionsRepository } from '../repositories/sessions.ts';
import { TasksRepository } from '../repositories/tasks.ts';
import { TimersRepository } from '../repositories/timers.ts';
import type { UserRecord } from '../repositories/users.ts';
import { UsersRepository } from '../repositories/users.ts';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Dependencias compartidas por los servicios. */
export class ServiceContext {
  readonly db: Database;
  readonly config: Config;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly users: UsersRepository;
  readonly sessions: SessionsRepository;
  readonly settings: SettingsRepository;
  readonly weeks: WeeksRepository;
  readonly tasks: TasksRepository;
  readonly timers: TimersRepository;
  readonly audit: AuditRepository;

  constructor(db: Database, config: Config, logger: Logger, clock: Clock = systemClock) {
    this.db = db;
    this.config = config;
    this.logger = logger;
    this.clock = clock;
    this.users = new UsersRepository(db);
    this.sessions = new SessionsRepository(db);
    this.settings = new SettingsRepository(db);
    this.weeks = new WeeksRepository(db);
    this.tasks = new TasksRepository(db);
    this.timers = new TimersRepository(db);
    this.audit = new AuditRepository(db);
  }

  nowIso(): string {
    return this.clock.now().toISOString();
  }

  today(): string {
    return today(this.config, this.clock.now());
  }

  record(entry: AuditInput): Promise<void> {
    return this.audit.insert(entry, this.nowIso());
  }
}

/** Usuario autenticado que ejecuta una operación. */
export interface Actor {
  user: UserRecord;
  ip: string | null;
}

export const isAdmin = (a: Actor): boolean => a.user.role === 'admin';
