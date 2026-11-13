import { loadDotEnv } from '../bootstrap-env.ts';
import { loadConfig } from '../config.ts';
import { connect } from '../db/connect.ts';
import { dropAll, migrate } from '../db/database.ts';
import { DEMO_USERS, seedDemo } from '../db/seed.ts';
import { createLogger } from '../logger.ts';
import { ServiceContext } from '../services/context.ts';

// Uso: npm run db:seed            → carga datos de demostración en una base vacía
//      npm run db:reset           → BORRA todas las tablas de la aplicación y vuelve a sembrar (solo desarrollo)
loadDotEnv();
const config = loadConfig();
const reset = process.argv.includes('--reset');
if (config.env === 'production') {
  console.error('Los datos de demostración no se cargan en producción. Use "npm run user:create-admin".');
  process.exit(1);
}
const db = await connect(config, 'planeacion-seed');
try {
  if (reset) {
    await dropAll(db);
    console.log(`Tablas de la aplicación eliminadas (${db.dialect}).`);
  }
  await migrate(db);
  const ctx = new ServiceContext(db, config, createLogger('silent'));
  const r = await seedDemo(ctx, { adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Coordinacion2026', memberPassword: process.env.SEED_MEMBER_PASSWORD ?? 'Equipo2026' });
  console.log(`Datos semilla creados (semanas ${r.previousWeekId} y ${r.currentWeekId}).`);
  console.log(`  Coordinación: ${DEMO_USERS.admin.email}`);
  console.log(`  Equipo:       ${DEMO_USERS.ye.email}, ${DEMO_USERS.ru.email}, ${DEMO_USERS.wi.email}`);
  console.log('  Contraseñas: ver SEED_ADMIN_PASSWORD / SEED_MEMBER_PASSWORD en .env (o README).');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
