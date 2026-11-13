// Ejecuta pruebas unitarias + integración con cobertura (V8) y verifica los umbrales.
// Global ≥ 80 % (líneas, funciones, ramas ≥ 70 %); lógica de negocio ≥ 90 % de líneas.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
const lcovFile = path.join(root, 'coverage', 'lcov.info');

// Por defecto las pruebas usan SQLite (no requiere instalar nada) y el cliente PostgreSQL queda fuera de la medición.
// Con --with-pg se usa PostgreSQL (TEST_DB=postgres) y se incluyen las pruebas del cliente PostgreSQL.
const withPg = process.argv.includes('--with-pg');
const args = [
  '--disable-warning=ExperimentalWarning',
  '--test',
  '--test-concurrency=1',
  '--experimental-test-coverage',
  '--test-coverage-include=src/server/**',
  '--test-coverage-include=src/shared/**',
  '--test-coverage-exclude=src/server/cli/**',
  '--test-coverage-exclude=src/server/index.ts',
  '--test-coverage-exclude=src/server/bootstrap-env.ts',
  ...(withPg ? [] : ['--test-coverage-exclude=src/server/db/pg/**', '--test-coverage-exclude=src/server/db/postgres.ts']),
  '--test-coverage-lines=80',
  '--test-coverage-functions=80',
  '--test-coverage-branches=70',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=lcov',
  `--test-reporter-destination=${lcovFile}`,
  'tests/unit/**/*.test.ts',
  'tests/integration/**/*.test.ts',
  ...(withPg ? ['tests/integration-pg/**/*.test.ts'] : []),
];
const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: { ...process.env, TEST_DB: withPg ? 'postgres' : 'sqlite' } });
const out = r.stdout + r.stderr;
const tableStart = out.indexOf('# start of coverage report');
process.stdout.write(tableStart >= 0 ? out.slice(out.lastIndexOf('\nℹ tests', tableStart) >= 0 ? out.lastIndexOf('\nℹ tests', tableStart) : tableStart) : out.slice(-4000));

// --- Resumen por grupo a partir de lcov
const files = new Map();
let cur = null;
for (const line of fs.readFileSync(lcovFile, 'utf8').split('\n')) {
  if (line.startsWith('SF:')) cur = { file: path.relative(root, line.slice(3)), lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 };
  else if (cur && /^(LF|LH|FNF|FNH|BRF|BRH):/.test(line)) {
    const [k, v] = line.split(':');
    cur[k.toLowerCase()] = Number(v);
  } else if (line === 'end_of_record' && cur) {
    files.set(cur.file, cur);
    cur = null;
  }
}
const pct = (h, f) => (f ? (h / f) * 100 : 100);
const agg = (filter) => {
  const sel = [...files.values()].filter((f) => filter(f.file));
  const s = sel.reduce((a, f) => ({ lf: a.lf + f.lf, lh: a.lh + f.lh, fnf: a.fnf + f.fnf, fnh: a.fnh + f.fnh, brf: a.brf + f.brf, brh: a.brh + f.brh }), { lf: 0, lh: 0, fnf: 0, fnh: 0, brf: 0, brh: 0 });
  return { files: sel.length, lines: pct(s.lh, s.lf), functions: pct(s.fnh, s.fnf), branches: pct(s.brh, s.brf) };
};
const business = (f) => /src\/shared\/(rules|weeks|validation|constants)\.ts$/.test(f) || /src\/server\/services\//.test(f);
const groups = {
  'Global (servidor + compartido)': agg(() => true),
  'Lógica de negocio (rules, weeks, validation, services)': agg(business),
  'Repositorios y base de datos': agg((f) => /src\/server\/(repositories|db)\//.test(f) && !/db\/pg\//.test(f)),
  'Cliente PostgreSQL nativo': agg((f) => /src\/server\/db\/pg\//.test(f)),
  'Capa HTTP': agg((f) => /src\/server\/(http|routes)\/|src\/server\/app\.ts$/.test(f)),
};
const fmt = (n) => n.toFixed(1).padStart(5) + ' %';
let md = '# Resumen de cobertura\n\n| Grupo | Archivos | Líneas | Funciones | Ramas |\n|---|---:|---:|---:|---:|\n';
for (const [k, v] of Object.entries(groups)) md += `| ${k} | ${v.files} | ${fmt(v.lines)} | ${fmt(v.functions)} | ${fmt(v.branches)} |\n`;
md += '\n| Archivo | Líneas | Funciones | Ramas |\n|---|---:|---:|---:|\n';
for (const f of [...files.values()].sort((a, b) => a.file.localeCompare(b.file))) md += `| ${f.file} | ${fmt(pct(f.lh, f.lf))} | ${fmt(pct(f.fnh, f.fnf))} | ${fmt(pct(f.brh, f.brf))} |\n`;
md += `\nMotor de pruebas: ${withPg ? 'PostgreSQL' : 'SQLite'} · Generado: ${new Date().toISOString()} · Fuente: coverage/lcov.info (V8, node --experimental-test-coverage)\n`;
fs.writeFileSync(path.join(root, 'coverage', 'summary.md'), md);

console.log(`\nResumen por grupo (motor de pruebas: ${withPg ? 'PostgreSQL' : 'SQLite'}):`);
for (const [k, v] of Object.entries(groups)) console.log(`  ${k.padEnd(56)} líneas ${fmt(v.lines)} · funciones ${fmt(v.functions)} · ramas ${fmt(v.branches)}`);
let ok = r.status === 0;
if (groups['Lógica de negocio (rules, weeks, validation, services)'].lines < 90) {
  console.error('✖ La cobertura de líneas de la lógica de negocio es menor al 90 %.');
  ok = false;
}
if (!ok) {
  console.error('✖ Cobertura o pruebas por debajo de los umbrales.');
  process.exit(1);
}
console.log('✔ Umbrales de cobertura cumplidos. Detalle en coverage/summary.md');
