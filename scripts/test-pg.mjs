// Ejecuta las pruebas de integración contra PostgreSQL (TEST_DB=postgres), más las del cliente PostgreSQL.
// Requiere un servidor de pruebas: "npm run db:local" o TEST_DATABASE_URL (rol con CREATEDB).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--test', '--test-concurrency=1', '--test-reporter=spec', 'tests/integration/**/*.test.ts', 'tests/integration-pg/**/*.test.ts'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, TEST_DB: 'postgres' } },
);
process.exit(r.status ?? 1);
