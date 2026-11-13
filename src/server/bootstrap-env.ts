import fs from 'node:fs';

/** Carga variables desde .env (si existe) sin sobrescribir las ya definidas. */
export function loadDotEnv(file = process.env.ENV_FILE ?? '.env'): void {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
