import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/**
 * Política de caché: solo los recursos con versión de compilación (`?v=<hash>`) son inmutables.
 * El HTML, los recursos sin versión y los de desarrollo (`?v=dev…`, cambian en cada guardado) se revalidan siempre.
 */
export function cacheControlFor(ext: string, version: string | null): string {
  if (ext !== '.html' && version && !version.startsWith('dev')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

/** Sirve archivos estáticos con protección contra path traversal y fallback SPA. */
export function serveStatic(req: IncomingMessage, res: ServerResponse, publicDir: string, pathname: string, version: string | null = null): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const root = path.resolve(publicDir);
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  if (rel.includes('\0')) {
    res.statusCode = 400;
    res.end();
    return;
  }
  let file = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  let stat = safeStat(file);
  if (!stat?.isFile()) {
    // Rutas de la SPA (sin extensión) devuelven index.html; archivos inexistentes, 404.
    if (path.extname(rel)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('No encontrado');
      return;
    }
    file = path.join(root, 'index.html');
    stat = safeStat(file);
    if (!stat?.isFile()) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('La interfaz no está compilada. Ejecute "npm run build".');
      return;
    }
  }
  const ext = path.extname(file);
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', cacheControlFor(ext, version));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

function safeStat(file: string): fs.Stats | null {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}
