// Modo desarrollo: recompila la interfaz al guardar y reinicia el servidor con --watch.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'dist/public');
fs.mkdirSync(pub, { recursive: true });
fs.writeFileSync(path.join(pub, 'index.html'), fs.readFileSync(path.join(root, 'src/client/index.html'), 'utf8').replaceAll('__BUILD__', `dev-${Date.now().toString(36)}`));
for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(pub, f));

const js = await esbuild.context({ entryPoints: { app: path.join(root, 'src/client/main.tsx') }, bundle: true, sourcemap: true, format: 'esm', jsx: 'automatic', outdir: pub, logLevel: 'info' });
const css = await esbuild.context({ entryPoints: [path.join(root, 'src/client/styles.css')], bundle: true, outfile: path.join(pub, 'app.css'), logLevel: 'info' });
await Promise.all([js.watch(), css.watch()]);

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch-path=src/server', '--watch-path=src/shared', 'src/server/index.ts'], { cwd: root, stdio: 'inherit' });
const stop = () => {
  server.kill('SIGTERM');
  void js.dispose();
  void css.dispose();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
