import { loadDotEnv } from '../bootstrap-env.ts';
import { loadConfig } from '../config.ts';
import { connectForServer } from '../db/connect.ts';
import { createLogger } from '../logger.ts';
import { UsersService } from '../services/admin.ts';
import { ServiceContext } from '../services/context.ts';
import { createUserSchema } from '../../shared/validation.ts';

// Uso: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run user:create-admin
loadDotEnv();
const config = loadConfig();
const input = createUserSchema.parse({
  email: process.env.ADMIN_EMAIL ?? '',
  name: process.env.ADMIN_NAME ?? 'Coordinación',
  role: 'admin',
  inTeam: false,
  password: process.env.ADMIN_PASSWORD ?? '',
});
if (!input.ok) {
  console.error('Datos inválidos:', input.errors);
  console.error('Defina ADMIN_EMAIL, ADMIN_NAME y ADMIN_PASSWORD (mín. 10 caracteres con letras y números).');
  process.exit(1);
}
const db = await connectForServer(config);
try {
  const user = await new UsersService(new ServiceContext(db, config, createLogger('silent'))).create(input.value, null);
  console.log(`Administrador creado: ${user.email}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
