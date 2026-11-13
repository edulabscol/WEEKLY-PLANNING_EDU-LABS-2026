// Construye la interfaz (React) y el servidor (Node) en dist/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pub = path.join(dist, 'public');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(pub, { recursive: true });

await esbuild.build({
  entryPoints: { app: path.join(root, 'src/client/main.tsx') },
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'firefox110', 'safari16'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: pub,
  metafile: true,
  logLevel: 'warning',
});
await esbuild.build({ entryPoints: [path.join(root, 'src/client/styles.css')], bundle: true, minify: true, outfile: path.join(pub, 'app.css'), logLevel: 'warning' });

const hash = createHash('sha256').update(fs.readFileSync(path.join(pub, 'app.js'))).update(fs.readFileSync(path.join(pub, 'app.css'))).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(pub, 'index.html'), fs.readFileSync(path.join(root, 'src/client/index.html'), 'utf8').replaceAll('__BUILD__', hash));
for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(pub, f));

await esbuild.build({
  entryPoints: [path.join(root, 'src/server/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  outfile: path.join(dist, 'server.js'),
  banner: { js: '// Planeación semanal – servidor compilado' },
  logLevel: 'warning',
});

for (const cli of ['migrate', 'seed', 'backup', 'create-admin']) {
  await esbuild.build({
    entryPoints: [path.join(root, `src/server/cli/${cli}.ts`)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    outfile: path.join(dist, 'cli', `${cli}.js`),
    logLevel: 'warning',
  });
}

const kb = (f) => (fs.statSync(path.join(pub, f)).size / 1024).toFixed(1) + ' KB';
console.log(`Build OK (${hash}) → dist/  app.js ${kb('app.js')} · app.css ${kb('app.css')}`);
