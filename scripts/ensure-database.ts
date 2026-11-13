// Crea la base de datos de DATABASE_URL si no existe (solo desarrollo y pruebas).
// Se conecta a la base "postgres" del mismo servidor; el usuario necesita permiso CREATEDB.
import { dialectOf, quoteIdent } from '../src/server/db/database.ts';
import { PgDatabase } from '../src/server/db/postgres.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
if (dialectOf(url) === 'sqlite') process.exit(0); // SQLite crea el archivo al conectar
const target = new URL(url);
const name = decodeURIComponent(target.pathname.slice(1));
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
  console.error(`Nombre de base de datos no admitido por este script: ${name}`);
  process.exit(1);
}
const admin = new URL(url);
admin.pathname = '/postgres';
const db = new PgDatabase({ url: admin.toString(), poolMax: 1 });
try {
  const exists = await db.get('SELECT 1 AS ok FROM pg_database WHERE datname = $name', { name });
  if (!exists) {
    await db.exec(`CREATE DATABASE ${quoteIdent(name)}`);
    console.log(`Base de datos creada: ${name}`);
  }
} catch (err) {
  console.error('No se pudo verificar o crear la base de datos:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
