import type { Database } from '../db/database.ts';

export interface TimerRecord {
  ownerId: string;
  taskId: string;
  userId: string;
  startedAt: string;
}

interface TimerRow {
  owner_id: string;
  task_id: string;
  user_id: string;
  started_at: string;
}

const toTimer = (r: TimerRow): TimerRecord => ({ ownerId: r.owner_id, taskId: r.task_id, userId: r.user_id, startedAt: r.started_at });

export class TimersRepository {
  readonly #db: Database;
  constructor(db: Database) {
    this.#db = db;
  }

  async getByOwner(ownerId: string): Promise<TimerRecord | undefined> {
    const r = await this.#db.get<TimerRow>('SELECT * FROM timers WHERE owner_id = $ownerId', { ownerId });
    return r ? toTimer(r) : undefined;
  }

  async getByAssignment(taskId: string, userId: string): Promise<TimerRecord | undefined> {
    const r = await this.#db.get<TimerRow>('SELECT * FROM timers WHERE task_id = $taskId AND user_id = $userId', { taskId, userId });
    return r ? toTimer(r) : undefined;
  }

  async insert(t: TimerRecord): Promise<void> {
    await this.#db.run('INSERT INTO timers (owner_id, task_id, user_id, started_at) VALUES ($ownerId, $taskId, $userId, $startedAt)', { ...t });
  }

  async deleteByOwner(ownerId: string): Promise<void> {
    await this.#db.run('DELETE FROM timers WHERE owner_id = $ownerId', { ownerId });
  }

  async deleteByTask(taskId: string): Promise<void> {
    await this.#db.run('DELETE FROM timers WHERE task_id = $taskId', { taskId });
  }
}
