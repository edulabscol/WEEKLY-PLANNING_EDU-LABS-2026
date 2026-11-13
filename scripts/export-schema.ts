// Genera deploy/postgres/schema.sql a partir de las migraciones (referencia legible para el DBA).
// Uso: node scripts/export-schema.ts      (una prueba unitaria verifica que esté sincronizado)
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from '../src/server/db/migrations.ts';

export function renderSchema(): string {
  const parts = MIGRATIONS.map((m) => `-- ---------------------------------------------------------------- migración ${m.id}: ${m.name}\n${m.sql.trim()}\n`);
  return [
    '-- Planeación semanal · Esquema PostgreSQL 16 (GENERADO a partir de src/server/db/migrations.ts; no editar a mano).',
    '-- La aplicación aplica estas migraciones con "npm run db:migrate" y las registra en la tabla schema_migrations.',
    '',
    ...parts,
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.dirname, 'export-schema.ts')) {
  const out = path.resolve(import.meta.dirname, '../deploy/postgres/schema.sql');
  fs.writeFileSync(out, renderSchema());
  console.log(`Esquema exportado: ${path.relative(process.cwd(), out)}`);
}
