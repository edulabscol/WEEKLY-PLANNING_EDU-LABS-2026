// Preparación local, multiplataforma (Windows, macOS, Linux). Uso: npm install && npm run setup
//   --browsers   instala además Chromium para las pruebas de navegador (Playwright)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log(`\x1b[32m✔\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m✖\x1b[0m ${m}`);
  process.exit(1);
};
const run = (label, args) => {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) fail(`${label} falló.`);
  ok(label);
};

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) fail(`Se requiere Node.js 22.18 o superior (tiene ${process.version}). Descárguelo en https://nodejs.org (versión LTS).`);
ok(`Node.js ${process.version}`);

if (!fs.existsSync(path.join(root, 'node_modules', 'react'))) fail('Faltan dependencias: ejecute primero "npm install".');
ok('Dependencias instaladas');

const env = path.join(root, '.env');
if (!fs.existsSync(env)) {
  fs.copyFileSync(path.join(root, '.env.example'), env);
  ok('Archivo .env creado (SQLite local: data/planeacion.db)');
} else ok('Archivo .env existente (no se modificó)');

run('Compilación (interfaz y servidor)', ['scripts/build.mjs']);
run('Base de datos local (migraciones)', ['--disable-warning=ExperimentalWarning', 'src/server/cli/migrate.ts']);

if (process.argv.includes('--browsers')) {
  const cli = path.join(root, 'node_modules', 'playwright', 'cli.js');
  run('Chromium para pruebas de navegador', [cli, 'install', 'chromium']);
}

console.log(`
Listo. Para iniciar en modo desarrollo:

    npm run dev

y abra http://127.0.0.1:3000  (los datos de demostración se cargan solos la primera vez).
Credenciales: coordinacion@edulabs.test / Coordinacion2026  ·  yerson@edulabs.test / Equipo2026
`);
