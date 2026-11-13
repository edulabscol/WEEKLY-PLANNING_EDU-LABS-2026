import { createApp } from './app.ts';
import { loadDotEnv } from './bootstrap-env.ts';
import { insecureRemoteDb, loadConfig } from './config.ts';
import { connectForServer } from './db/connect.ts';
import { describeDatabase } from './db/describe.ts';
import { isDatabaseEmpty, seedDemo } from './db/seed.ts';
import { createLogger } from './logger.ts';
import { ServiceContext } from './services/context.ts';

loadDotEnv();
const config = loadConfig();
const logger = createLogger(config.logLevel);

async function main(): Promise<void> {
  const target = describeDatabase(config.database.url);
  if (insecureRemoteDb(config.database.url)) {
    logger.warn('La conexión con PostgreSQL no exige cifrado. Use sslmode=require o verify-full en DATABASE_URL.', target);
  }
  if (target.dialect === 'sqlite' && config.env === 'production') {
    logger.warn('Producción con SQLite: se recomienda PostgreSQL (ver docs/DATABASE.md).', target);
  }
  const db = await connectForServer(config);
  logger.info('Base de datos lista', { ...target, autoMigrate: config.database.autoMigrate });

  if (config.env !== 'production' && process.env.SEED_ON_EMPTY === 'true') {
    const ctx = new ServiceContext(db, config, logger);
    if (await isDatabaseEmpty(ctx)) {
      const r = await seedDemo(ctx, {
        adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Coordinacion2026',
        memberPassword: process.env.SEED_MEMBER_PASSWORD ?? 'Equipo2026',
      });
      logger.info('Datos semilla creados', r);
    }
  }

  const app = createApp(db, config, logger);
  const cleanup = setInterval(() => {
    app.services.ctx.sessions.deleteExpired(new Date().toISOString()).catch((err: unknown) => logger.warn('No se pudieron limpiar las sesiones vencidas', { err: String(err) }));
  }, 3600_000);
  cleanup.unref();

  app.server.listen(config.port, config.host, () => {
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : config.port;
    logger.info('Servidor iniciado', { url: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${port}`, env: config.env });
  });

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    logger.info('Deteniendo servidor', { signal });
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    void app
      .close()
      .then(() => db.close())
      .then(() => {
        clearInterval(cleanup);
        logger.info('Servidor detenido');
        process.exit(0);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.error('No se pudo iniciar el servidor', { err: err instanceof Error ? err : String(err) });
  process.exit(1);
});
