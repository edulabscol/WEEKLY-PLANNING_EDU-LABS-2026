import { ADMIN, expect, login, test, YERSON } from './fixtures.ts';

test.describe('Acceso y autenticación', () => {
  test('muestra el inicio de sesión y valida el formulario', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Escribe un correo electrónico válido.')).toBeVisible();
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible();
  });

  test('rechaza credenciales incorrectas sin revelar cuál falló', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await page.getByLabel('Correo').fill(YERSON.email);
    await page.getByLabel('Contraseña').fill('NoEsLaClave1');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
    // El 401 de este intento es la respuesta esperada del servidor, no un error de la aplicación.
    expect(consoleErrors.splice(0).every((e) => e.includes('401'))).toBe(true);
  });

  test('inicia sesión, conserva la sesión al recargar y la cierra', async ({ page }) => {
    await login(page, YERSON);
    await expect(page.getByTestId('week-title')).toHaveText('Semana 45');
    await expect(page.getByText('Esta semana', { exact: true })).toBeVisible();
    await expect(page.getByText('2 – 6 nov 2026')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('week-title')).toHaveText('Semana 45');
    await page.getByRole('button', { name: 'Menú de Yerson' }).click();
    await expect(page.getByRole('menuitem', { name: 'Equipo y ajustes' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  });

  test('Coordinación tiene acceso a "Equipo y ajustes"', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Menú de Coordinación/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Equipo y ajustes' })).toBeVisible();
  });
});
