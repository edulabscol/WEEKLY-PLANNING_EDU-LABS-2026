import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadDotEnv } from '../bootstrap-env.ts';
import { loadConfig } from '../config.ts';
import { dialectOf } from '../db/database.ts';
import { parseDatabaseUrl } from '../db/pg/pool.ts';

// Respaldo de la base de datos. Uso: npm run db:backup [-- carpeta_destino]
//  - PostgreSQL: pg_dump (formato custom). Restaurar: pg_restore --clean --if-exists -d <base> archivo.dump
//  - SQLite:     copia consistente en caliente (VACUUM INTO). Restaurar: detener la app y reemplazar el archivo.
loadDotEnv();
const config = loadConfig();
const dir = path.resolve(process.argv[2] ?? process.env.BACKUP_DIR ?? './backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const keep = Number(process.env.BACKUP_KEEP ?? '14');

function rotate(ext: string): void {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('planeacion-') && f.endsWith(ext)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.rmSync(path.join(dir, f));
}

if (dialectOf(config.database.url) === 'sqlite') {
  const { connect } = await import('../db/connect.ts');
  const { SqliteDatabase } = await import('../db/sqlite.ts');
  const target = path.join(dir, `planeacion-${stamp}.db`);
  const db = await connect(config);
  try {
    if (!(db instanceof SqliteDatabase)) throw new Error('Se esperaba SQLite.');
    await db.backupTo(target);
    rotate('.db');
    console.log(`Respaldo creado: ${target}`);
  } finally {
    await db.close();
  }
} else {
  const conn = parseDatabaseUrl(config.database.url);
  const target = path.join(dir, `planeacion-${stamp}.dump`);
  const env = {
    ...process.env,
    PGHOST: conn.host,
    PGPORT: String(conn.port),
    PGUSER: conn.user,
    PGPASSWORD: conn.password,
    PGDATABASE: conn.database,
    PGSSLMODE: conn.sslMode,
    ...(conn.sslRootCert ? { PGSSLROOTCERT: conn.sslRootCert } : {}),
  };
  const child = spawn(process.env.PG_DUMP ?? 'pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${target}`], { env, stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', (e) => {
    console.error(`No se pudo ejecutar pg_dump (${e.message}). Instale el cliente de PostgreSQL 16 o defina PG_DUMP.`);
    process.exit(1);
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      fs.rmSync(target, { force: true });
      console.error(`pg_dump terminó con código ${code}.`);
      process.exit(1);
    }
    rotate('.dump');
    console.log(`Respaldo creado: ${target} (${(fs.statSync(target).size / 1024).toFixed(1)} KB)`);
  });
}
