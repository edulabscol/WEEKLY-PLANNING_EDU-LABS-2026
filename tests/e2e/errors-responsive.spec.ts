import { closeDrawer, expect, login, openTask, row, test, YERSON } from './fixtures.ts';

test.describe('Manejo de errores', () => {
  test('si el servidor falla al guardar, se informa y se revierte el cambio', async ({ page, consoleErrors }) => {
    await login(page, YERSON);
    await page.route('**/api/tasks/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'Ocurrió un error inesperado. Intenta de nuevo.' } }) })
        : route.continue(),
    );
    const r = row(page, 'Storyboard Módulo 4');
    await r.getByLabel(/Estado de/).selectOption('blocked');
    await expect(page.getByTestId('toast')).toContainText('Ocurrió un error inesperado');
    await expect(r.getByLabel(/Estado de/)).toHaveValue('doing');
    // El 500 fue simulado a propósito en esta prueba.
    expect(consoleErrors.splice(0).every((e) => e.includes('500'))).toBe(true);
  });

  test('si la sesión expira, vuelve al inicio de sesión con un aviso', async ({ page, consoleErrors }) => {
    await login(page, YERSON);
    await page.context().clearCookies();
    await page.getByRole('button', { name: 'Sprint anterior' }).click();
    await expect(page.getByText('Tu sesión expiró. Vuelve a iniciar sesión.')).toBeVisible();
    expect(consoleErrors.splice(0).every((e) => e.includes('401'))).toBe(true);
  });
});

test.describe('Diseño responsive', () => {
  for (const vp of [
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'móvil', width: 390, height: 844 },
  ]) {
    test(`lista usable en ${vp.name} sin desbordamiento horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page, YERSON);
      await expect(page.getByTestId('task-row').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByText('Responsables', { exact: true })).toHaveCount(0);
      await openTask(page, 'Storyboard Módulo 4');
      const box = await page.getByTestId('task-drawer').boundingBox();
      expect(box?.width).toBeGreaterThan(vp.width < 760 ? vp.width - 2 : 490);
      await closeDrawer(page);
    });
  }
});
