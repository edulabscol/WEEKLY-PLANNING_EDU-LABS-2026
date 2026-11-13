import { expect, login, row, test, YERSON } from './fixtures.ts';

test.describe('Vistas, búsqueda y filtros', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, YERSON);
  });

  test('muestra los indicadores de la semana', async ({ page }) => {
    const cards = page.getByTestId('stat-card');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Cumplimiento del sprint');
    await expect(cards.nth(1)).toContainText('Tareas adicionales');
    await expect(cards.nth(2)).toContainText('Vencidas sin completar');
    await expect(cards.nth(3)).toContainText('Personas excedidas');
    await expect(cards.nth(3)).toContainText('de 3');
  });

  test('busca por nombre, proyecto o solicitante', async ({ page }) => {
    const search = page.getByLabel('Buscar');
    await search.fill('SSO');
    await expect(page.getByTestId('task-row')).toHaveCount(1);
    await expect(row(page, 'Integración SSO con Office 365')).toBeVisible();
    await search.fill('Cliente UAPR');
    await expect(row(page, 'Reportes de notas para cierre de semestre')).toBeVisible();
    await search.fill('zzz-no-existe');
    await expect(page.getByText('No hay tareas que coincidan con “zzz-no-existe”.')).toBeVisible();
    await expect(page.getByTestId('task-row')).toHaveCount(0);
    await search.fill('');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
  });

  test('filtra por persona del equipo', async ({ page }) => {
    const all = await page.getByTestId('task-row').count();
    await page.getByRole('button', { name: 'Wilson', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Wilson', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const filtered = await page.getByTestId('task-row').count();
    expect(filtered).toBeLessThan(all);
    await expect(row(page, 'Storyboard Módulo 4')).toHaveCount(0);
    await expect(row(page, 'Banco de infografías Unidad 2')).toBeVisible();
    await page.getByRole('button', { name: 'Todos' }).click();
    await expect(page.getByTestId('task-row')).toHaveCount(all);
  });

  test('contrae y expande una sección', async ({ page }) => {
    const section = page.getByTestId('section-extra');
    await section.getByRole('button', { name: 'Contraer sección' }).click();
    await expect(section.getByTestId('task-row')).toHaveCount(0);
    await section.getByRole('button', { name: 'Expandir sección' }).click();
    await expect(section.getByTestId('task-row').first()).toBeVisible();
  });

  test('tablero: arrastrar una tarjeta cambia su estado', async ({ page }) => {
    await page.getByRole('tab', { name: 'Tablero' }).click();
    const card = page.locator('[data-testid="board-card"][data-task-name="Edición de video testimonial para redes"]');
    await expect(page.getByTestId('column-review').locator('[data-task-name="Edición de video testimonial para redes"]')).toBeVisible();
    await card.dragTo(page.getByTestId('column-done'), { targetPosition: { x: 140, y: 24 } });
    await expect(page.getByTestId('column-done').locator('[data-task-name="Edición de video testimonial para redes"]')).toBeVisible();
    await expect(page.getByTestId('toast')).toContainText('Estado: Completada');
    await page.reload();
    await page.getByRole('tab', { name: 'Tablero' }).click();
    await expect(page.getByTestId('column-done').locator('[data-task-name="Edición de video testimonial para redes"]')).toBeVisible();
  });

  test('carga del equipo: estados de capacidad y detalle por persona', async ({ page }) => {
    await page.getByRole('tab', { name: 'Carga del equipo' }).click();
    const rows = page.getByTestId('load-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Yerson');
    await expect(rows.nth(0).getByTestId('load-state')).toContainText('Excedido');
    await rows.nth(0).getByRole('button').first().click();
    await expect(page.getByText('Tareas de Yerson esta semana')).toBeVisible();
    await page.getByRole('button', { name: 'Ver en la lista' }).click();
    await expect(page.getByRole('tab', { name: 'Lista' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Yerson', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('atajos de teclado y ayuda', async ({ page }) => {
    await page.getByRole('button', { name: 'Ayuda' }).click();
    await expect(page.getByRole('dialog', { name: 'Cómo funciona' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Cómo funciona' })).toHaveCount(0);
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByTestId('week-title')).toHaveText('Semana 44');
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(page.getByText(/Semana cerrada\. Puedes consultar y corregir horas\. 3 tareas no completadas pasaron a la Semana 45\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Semana anterior' })).toBeDisabled();
    await page.getByRole('button', { name: 'Ir a esta semana' }).click();
    await expect(page.getByTestId('week-title')).toHaveText('Semana 45');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(page.getByTestId('week-title')).toHaveText('Semana 46');
  });
});
