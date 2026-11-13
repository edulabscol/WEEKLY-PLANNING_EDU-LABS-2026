import { closeDrawer, expect, login, openTask, row, test, uniq, YERSON } from './fixtures.ts';

test.describe('Tareas: crear, consultar, editar y eliminar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, YERSON);
  });

  test('crea una tarea desde "Nueva tarea" con autoguardado y persiste al recargar', async ({ page }) => {
    const name = uniq('Guion módulo 5');
    await page.getByRole('button', { name: 'Nueva tarea' }).click();
    const drawer = page.getByTestId('task-drawer');
    await expect(drawer.getByText('Borrador')).toBeVisible();
    await drawer.getByLabel('Nombre de la tarea').fill(name);
    await expect(drawer.getByText('✓ Guardado')).toBeVisible();
    await drawer.getByLabel('Proyecto').fill('FUCS');
    await drawer.getByRole('button', { name: 'Alta', exact: true }).click();
    await drawer.getByRole('button', { name: 'Agregar a Yerson como responsable' }).click();
    await expect(drawer.getByTestId('assignee-row')).toHaveCount(1);
    await drawer.getByLabel('Estimado horas de Yerson').fill('3');
    await drawer.getByLabel('Estimado horas de Yerson').blur();
    await closeDrawer(page);
    await expect(row(page, name)).toBeVisible();
    await expect(row(page, name)).toContainText('FUCS');
    await expect(row(page, name)).toContainText('Alta');
    await expect(row(page, name)).toContainText('3h');

    await page.reload();
    await expect(row(page, name)).toBeVisible();
    await expect(row(page, name)).toContainText('3h');
  });

  test('descarta una tarea nueva sin nombre', async ({ page }) => {
    const count = await page.getByTestId('count-plan').innerText();
    await page.keyboard.press('n');
    await expect(page.getByTestId('task-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('toast')).toContainText('Se descartó la tarea sin nombre');
    await expect(page.getByTestId('count-plan')).toHaveText(count);
  });

  test('no permite dejar una tarea existente sin nombre', async ({ page }) => {
    await openTask(page, 'Storyboard Módulo 4');
    const drawer = page.getByTestId('task-drawer');
    await drawer.getByLabel('Nombre de la tarea').fill('');
    await drawer.getByRole('button', { name: 'Listo' }).click();
    await expect(drawer.getByText('Escribe un nombre para guardar la tarea.')).toBeVisible();
    await drawer.getByLabel('Nombre de la tarea').fill('Storyboard Módulo 4');
    await closeDrawer(page);
  });

  test('agrega rápido con Enter en "Tareas adicionales"', async ({ page }) => {
    const name = uniq('Soporte urgente campus');
    const section = page.getByTestId('section-extra');
    const before = Number(await page.getByTestId('count-extra').innerText());
    await section.getByPlaceholder('Agregar tarea adicional y presionar Enter').fill(name);
    await section.getByPlaceholder('Agregar tarea adicional y presionar Enter').press('Enter');
    await expect(page.getByTestId('toast')).toContainText('Tarea agregada');
    await expect(page.getByTestId('count-extra')).toHaveText(String(before + 1));
    await expect(section.locator(`[data-task-name="${name}"]`)).toContainText('Sin asignar');
  });

  test('edita estado, avance, fecha y descripción y los conserva', async ({ page }) => {
    const name = uniq('Revisión de rúbricas');
    await page.getByTestId('section-plan').getByPlaceholder('Agregar tarea planeada y presionar Enter').fill(name);
    await page.keyboard.press('Enter');
    await expect(row(page, name)).toBeVisible();
    await openTask(page, name);
    const drawer = page.getByTestId('task-drawer');
    await drawer.getByLabel('Estado').selectOption('review');
    await expect(drawer.getByTestId('drawer-progress')).toHaveText('0%');
    await drawer.getByLabel('Vence').fill('2026-11-03');
    await expect(drawer.getByText('Vencida', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Justificación del retraso')).toBeVisible();
    await drawer.getByLabel('Tarea adicional que causó el retraso').selectOption({ label: 'Integración SSO con Office 365' });
    await drawer.getByLabel('Descripción').fill('Rúbricas de los módulos 1 a 3.\nEntregar en PDF.');
    await closeDrawer(page);
    await expect(row(page, name)).toContainText('En revisión');
    await expect(row(page, name)).toContainText('vencida');
    await expect(row(page, name)).toContainText('Retraso justificado');
    await page.reload();
    await openTask(page, name);
    await expect(page.getByTestId('task-drawer').getByLabel('Descripción')).toHaveValue('Rúbricas de los módulos 1 a 3.\nEntregar en PDF.');
    await closeDrawer(page);
  });

  test('completa con la casilla y deshace desde el aviso', async ({ page }) => {
    const r = row(page, 'Videos animados – Introducción al curso');
    await r.getByRole('button', { name: /como completada/ }).click();
    await expect(r.getByLabel(/Estado de/)).toHaveValue('done');
    await expect(r.getByLabel(/Porcentaje de avance/)).toHaveValue('100');
    await page.getByTestId('toast').getByRole('button', { name: 'Deshacer' }).click();
    await expect(r.getByLabel(/Estado de/)).toHaveValue('doing');
    await expect(r.getByLabel(/Porcentaje de avance/)).toHaveValue('40');
  });

  test('el avance al 100 % completa la tarea', async ({ page }) => {
    const r = row(page, 'Migración de usuarios campus virtual');
    await r.getByLabel(/Porcentaje de avance/).selectOption('100');
    await expect(r.getByLabel(/Estado de/)).toHaveValue('done');
    await expect(page.getByTestId('toast')).toContainText('Avance 100%: tarea completada');
    await page.getByTestId('toast').getByRole('button', { name: 'Deshacer' }).click();
    await expect(r.getByLabel(/Estado de/)).toHaveValue('doing');
  });

  test('elimina su propia tarea y la restaura con "Deshacer"', async ({ page }) => {
    const name = uniq('Tarea para borrar');
    await page.getByTestId('section-plan').getByPlaceholder('Agregar tarea planeada y presionar Enter').fill(name);
    await page.keyboard.press('Enter');
    await openTask(page, name);
    await page.getByTestId('task-drawer').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByTestId('toast')).toContainText(`Tarea eliminada: ${name}`);
    await expect(row(page, name)).toHaveCount(0);
    await page.getByTestId('toast').getByRole('button', { name: 'Deshacer' }).click();
    await expect(row(page, name)).toBeVisible();
    await page.reload();
    await expect(row(page, name)).toBeVisible();
  });

  test('un colaborador no ve "Eliminar" en tareas creadas por otros', async ({ page }) => {
    await openTask(page, 'Banco de infografías Unidad 2');
    await expect(page.getByTestId('task-drawer').getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
    await closeDrawer(page);
  });
});
