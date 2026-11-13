import { defineConfig, devices } from 'playwright/test';

/**
 * Motor de las pruebas de navegador: SQLite por defecto (archivos en test-results/db) o PostgreSQL con E2E_DB=postgres
 * (servidor de TEST_PG_BASE_URL; por defecto el clúster local de scripts/pg-local.sh).
 */
const PG = process.env.TEST_PG_BASE_URL ?? 'postgres://planeacion:planeacion_local@127.0.0.1:54329';
const dbUrl = (name: string): string => (process.env.E2E_DB === 'postgres' ? `${PG}/planeacion_${name}` : `sqlite:test-results/db/${name}.db`);
const START = 'node --disable-warning=ExperimentalWarning scripts/ensure-database.ts && node --disable-warning=ExperimentalWarning dist/cli/seed.js --reset && node --disable-warning=ExperimentalWarning dist/server.js';

const common = {
  NODE_ENV: 'test',
  APP_TODAY: '2026-11-05',
  LOG_LEVEL: 'warn',
  LOGIN_RATE_LIMIT: '1000',
  API_RATE_LIMIT: '100000',
  SEED_ADMIN_PASSWORD: 'Coordinacion2026',
  SEED_MEMBER_PASSWORD: 'Equipo2026',
};

/**
 * Dos servidores aislados (cada uno con su propia base de datos sembrada):
 *  - 3100 para los flujos funcionales (modifican datos)
 *  - 3101 para las pruebas visuales (datos intactos → capturas estables)
 * Las bases se crean si no existen y se reinician (seed --reset) en cada ejecución.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 7_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: 'test-results/artifacts',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'e2e', testIgnore: /visual\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:3100' } },
    { name: 'visual', testMatch: /visual\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:3101' } },
  ],
  webServer: [
    {
      command: START,
      url: 'http://127.0.0.1:3100/api/health',
      env: { ...common, PORT: '3100', DATABASE_URL: dbUrl('e2e') },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: START,
      url: 'http://127.0.0.1:3101/api/health',
      env: { ...common, PORT: '3101', DATABASE_URL: dbUrl('visual') },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
