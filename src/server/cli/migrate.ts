import { loadDotEnv } from '../bootstrap-env.ts';
import { loadConfig } from '../config.ts';
import { connect } from '../db/connect.ts';
import { migrate } from '../db/database.ts';

loadDotEnv();
const config = loadConfig();
const db = await connect(config, 'planeacion-migrate');
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Migraciones aplicadas: ${applied.map((m) => `${m.id}_${m.name}`).join(', ')}` : 'La base de datos ya está al día.');
} catch (err) {
  console.error('No se pudieron aplicar las migraciones:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
