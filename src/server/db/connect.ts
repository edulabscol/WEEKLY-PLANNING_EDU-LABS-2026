import type { Config } from '../config.ts';
import { createDatabase, type Database, type DatabaseOptions, openDatabase, pendingMigrations } from './database.ts';

/** Opciones de conexión a partir de la configuración. */
export function databaseOptions(config: Config, applicationName = 'planeacion-semanal'): DatabaseOptions {
  return { url: config.database.url, poolMax: config.database.poolMax, statementTimeoutMs: config.database.statementTimeoutMs, connectTimeoutMs: config.database.connectTimeoutMs, applicationName };
}

/** Abre la conexión y aplica las migraciones pendientes. */
export function connectAndMigrate(config: Config, applicationName?: string): Promise<Database> {
  return openDatabase(databaseOptions(config, applicationName));
}

/** Abre la conexión sin migrar. */
export function connect(config: Config, applicationName?: string): Promise<Database> {
  return createDatabase(databaseOptions(config, applicationName));
}

/**
 * Conexión para el servidor: migra si DB_AUTO_MIGRATE=true; si no, exige que el esquema esté al día
 * (las migraciones las aplica el rol propietario con "npm run db:migrate").
 */
export async function connectForServer(config: Config): Promise<Database> {
  if (config.database.autoMigrate) return connectAndMigrate(config);
  const db = await connect(config);
  try {
    const pending = await pendingMigrations(db);
    if (pending.length) throw new Error(`El esquema no está al día: faltan las migraciones ${pending.map((m) => m.id).join(', ')}. Ejecute "npm run db:migrate" con el rol propietario.`);
  } catch (e) {
    await db.close();
    throw e;
  }
  return db;
}
