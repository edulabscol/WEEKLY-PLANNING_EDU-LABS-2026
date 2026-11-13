import { closeDrawer, expect, login, openTask, row, test, uniq, YERSON } from './fixtures.ts';

test.describe('Registro de tiempo', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, YERSON);
  });

  test('suma tiempo rápido y lo corrige a mano', async ({ page }) => {
    const name = uniq('Ajustes de estilo');
    await page.getByTestId('section-plan').getByPlaceholder('Agregar tarea planeada y presionar Enter').fill(name);
    await page.keyboard.press('Enter');
    await openTask(page, name);
    const drawer = page.getByTestId('task-drawer');
    await drawer.getByRole('button', { name: 'Agregar a Yerson como responsable' }).click();
    await drawer.getByRole('button', { name: 'Sumar 30 min a Yerson' }).click();
    await expect(page.getByTestId('toast')).toContainText('Se sumaron 30 min a Yerson');
    await expect(drawer.getByLabel('Real minutos de Yerson')).toHaveValue('30');
    await drawer.getByRole('button', { name: 'Sumar 1 h a Yerson' }).click();
    await expect(drawer.getByLabel('Real horas de Yerson')).toHaveValue('1');
    await drawer.getByLabel('Real horas de Yerson').fill('2');
    await drawer.getByLabel('Real minutos de Yerson').fill('15');
    await drawer.getByLabel('Real minutos de Yerson').blur();
    await expect(drawer.getByText('✓ Guardado')).toBeVisible();
    await closeDrawer(page);
    await expect(row(page, name).getByTestId('row-real')).toHaveText('2h 15m');
    await page.reload();
    await expect(row(page, name).getByTestId('row-real')).toHaveText('2h 15m');
  });

  test('cronómetro: iniciar desde la fila, ver el reloj y detener', async ({ page }) => {
    const name = uniq('Cronometrada');
    await page.getByTestId('section-plan').getByPlaceholder('Agregar tarea planeada y presionar Enter').fill(name);
    await page.keyboard.press('Enter');
    await row(page, name).getByRole('button', { name: /Iniciar cronómetro/ }).click();
    await expect(page.getByTestId('toast')).toContainText('Asigna un responsable para registrar tiempo');
    const drawer = page.getByTestId('task-drawer');
    await drawer.getByRole('button', { name: 'Agregar a Yerson como responsable' }).click();
    await drawer.getByRole('button', { name: 'Cronometrar a Yerson' }).click();
    await expect(page.getByRole('status', { name: 'Cronómetro activo' })).toContainText(name);
    await expect(page.getByTestId('timer-clock')).toHaveText(/00:00:0[1-9]/, { timeout: 5000 });
    await closeDrawer(page);
    await expect(row(page, name).getByLabel(/Estado de/)).toHaveValue('doing');
    await page.reload();
    await expect(page.getByRole('status', { name: 'Cronómetro activo' })).toBeVisible();
    await page.getByRole('button', { name: '■ Detener' }).click();
    await expect(page.getByTestId('toast')).toContainText('Se registraron 1 min a Yerson');
    await expect(page.getByRole('status', { name: 'Cronómetro activo' })).toHaveCount(0);
  });

  test('un colaborador no puede registrar tiempo de otra persona', async ({ page }) => {
    await openTask(page, 'Banco de infografías Unidad 2');
    const drawer = page.getByTestId('task-drawer');
    await expect(drawer.getByLabel('Real horas de Wilson')).toBeDisabled();
    await expect(drawer.getByRole('button', { name: 'Sumar 15 min a Wilson' })).toBeDisabled();
    await expect(drawer.getByRole('button', { name: 'Cronometrar a Wilson' })).toBeDisabled();
    await closeDrawer(page);
    await row(page, 'Banco de infografías Unidad 2').getByRole('button', { name: /Iniciar cronómetro/ }).click();
    await expect(page.getByTestId('toast')).toContainText('Solo puedes cronometrar tu propio tiempo');
  });
});
