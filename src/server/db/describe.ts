import path from 'node:path';
import { dialectOf, sqlitePath } from './database.ts';
import { parseDatabaseUrl } from './pg/pool.ts';

/** Datos no sensibles de la conexión, para los logs (nunca incluye la contraseña). */
export function describeDatabase(url: string): Record<string, string | number> {
  if (dialectOf(url) === 'sqlite') return { dialect: 'sqlite', file: path.resolve(sqlitePath(url)) };
  const c = parseDatabaseUrl(url);
  return { dialect: 'postgres', host: c.host, port: c.port, database: c.database, user: c.user, sslmode: c.sslMode };
}
