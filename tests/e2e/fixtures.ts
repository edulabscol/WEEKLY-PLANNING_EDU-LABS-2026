import { expect, type Page, test as base } from 'playwright/test';

export const ADMIN = { email: 'coordinacion@edulabs.test', password: 'Coordinacion2026' };
export const YERSON = { email: 'yerson@edulabs.test', password: 'Equipo2026' };
export const RUBEN = { email: 'ruben@edulabs.test', password: 'Equipo2026' };

/**
 * - Bloquea recursos externos (fuentes, logo) para que las pruebas sean deterministas y no dependan de internet.
 * - Falla la prueba si hay errores de JavaScript o de consola no esperados.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/net::ERR_FAILED|ERR_BLOCKED/.test(text)) return; // recursos externos bloqueados a propósito
        errors.push(text);
      });
      await use(errors);
      expect(errors, 'errores en la consola del navegador').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo').fill(creds.email);
  await page.getByLabel('Contraseña').fill(creds.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByTestId('week-title')).toBeVisible();
}

export function row(page: Page, name: string) {
  return page.locator(`[data-testid="task-row"][data-task-name="${name.replace(/"/g, '\\"')}"]`);
}

export async function openTask(page: Page, name: string): Promise<void> {
  await row(page, name).getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('task-drawer')).toBeVisible();
}

export async function closeDrawer(page: Page): Promise<void> {
  await page.getByTestId('task-drawer').getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('task-drawer')).toBeHidden();
}

export const uniq = (prefix: string): string => `${prefix} ${Date.now().toString(36)}`;
