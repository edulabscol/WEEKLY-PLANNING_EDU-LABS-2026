import { ADMIN, expect, login, row, RUBEN, test, uniq } from './fixtures.ts';

test.describe('Semanas, roles y administración', () => {
  test('un colaborador no puede crear el tablero de una semana nueva', async ({ page }) => {
    await login(page, RUBEN);
    const empty = page.getByRole('heading', { name: /aún no tiene tablero/ });
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    // Avanza hasta la primera semana sin tablero (la 46, o la 47 si Coordinación ya creó la 46).
    for (let i = 0; i < 3 && !(await empty.isVisible()); i++) {
      await page.getByRole('button', { name: 'Semana siguiente' }).click();
      await expect(page.getByText('Cargando la semana…')).toHaveCount(0);
      await expect(page.getByTestId('task-row').first().or(empty)).toBeVisible();
    }
    await expect(empty).toBeVisible();
    await expect(page.getByText('Coordinación crea el tablero de cada semana.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Crear tablero/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nueva tarea' })).toBeDisabled();
  });

  test('Coordinación crea la semana siguiente trayendo las pendientes', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: 'Semana siguiente' }).click();
    await expect(page.getByTestId('week-title')).toHaveText('Semana 46');
    await expect(page.getByText('Próxima', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Semana 46 aún no tiene tablero' })).toBeVisible();
    const pending = page.getByRole('list', { name: 'Tareas pendientes' }).getByRole('listitem');
    await expect(pending.first()).toBeVisible();
    const n = await pending.count();
    expect(n).toBeGreaterThan(5);
    await page.getByRole('button', { name: `Crear tablero y traer ${n} pendientes` }).click();
    await expect(page.getByTestId('toast')).toContainText(`Tablero creado con ${n} tareas pendientes`);
    await expect(page.getByTestId('count-plan')).toHaveText(String(n));
    await expect(row(page, 'Storyboard Módulo 4')).toContainText('Viene de S45');
    await page.getByRole('button', { name: 'Semana anterior' }).click();
    await expect(row(page, 'Storyboard Módulo 4')).toContainText('Pasó a S46');
  });

  test('Coordinación agrega una persona y cambia la capacidad semanal', async ({ page }) => {
    await login(page, ADMIN);
    await page.getByRole('button', { name: /Menú de Coordinación/ }).click();
    await page.getByRole('menuitem', { name: 'Equipo y ajustes' }).click();
    const dialog = page.getByRole('dialog', { name: 'Equipo y ajustes' });
    await expect(dialog.getByTestId('admin-user')).toHaveCount(4);

    await dialog.getByRole('button', { name: 'Agregar persona' }).click();
    await expect(dialog.getByText('Escribe el nombre (mínimo 2 caracteres).')).toBeVisible();
    const email = `${uniq('laura').replace(/\s/g, '.')}@edulabs.test`;
    await dialog.getByLabel('Nombre').fill('Laura Gómez');
    await dialog.getByLabel('Correo').fill(email);
    await dialog.getByLabel('Cargo').fill('Diseñadora instruccional');
    await dialog.getByLabel('Contraseña inicial').fill('Bienvenida2026');
    await dialog.getByRole('button', { name: 'Agregar persona' }).click();
    await expect(page.getByTestId('toast')).toContainText('Laura se agregó al equipo');
    await expect(dialog.getByTestId('admin-user')).toHaveCount(5);

    const laura = dialog.getByTestId('admin-user').filter({ hasText: 'Laura Gómez' });
    await laura.getByRole('button', { name: 'Contraseña' }).click();
    await laura.getByLabel('Nueva contraseña para Laura Gómez').fill('corta');
    await laura.getByRole('button', { name: 'Restablecer' }).click();
    await expect(laura.getByText(/al menos 10 caracteres/)).toBeVisible();
    await laura.getByLabel('Nueva contraseña para Laura Gómez').fill('NuevaClave2027');
    await laura.getByRole('button', { name: 'Restablecer' }).click();
    await expect(page.getByTestId('toast')).toContainText('Se restableció la contraseña de Laura');

    await dialog.getByRole('tab', { name: 'Ajustes' }).click();
    await dialog.getByLabel('Capacidad semanal por persona (horas)').fill('45');
    await dialog.getByRole('button', { name: 'Guardar ajustes' }).click();
    await expect(page.getByTestId('toast')).toContainText('Ajustes guardados');

    await dialog.getByRole('tab', { name: 'Actividad' }).click();
    await expect(dialog.getByTestId('audit-item').first()).toContainText('Cambió los ajustes');
    const range = (await dialog.getByText(/^\d+–\d+ de \d+$/).innerText()).match(/de (\d+)/);
    const total = Number(range?.[1] ?? 0);
    if (total > 15) {
      await dialog.getByRole('button', { name: 'Siguiente ›' }).click();
      await expect(dialog.getByText(/^16–/)).toBeVisible();
      await expect(dialog.getByRole('button', { name: '‹ Anterior' })).toBeEnabled();
    } else {
      await expect(dialog.getByRole('button', { name: 'Siguiente ›' })).toBeDisabled();
    }
    await dialog.getByRole('button', { name: 'Cerrar' }).click();

    await expect(page.getByRole('button', { name: 'Laura', exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-card').nth(3)).toContainText('superan 45h esta semana');
    await expect(page.getByTestId('stat-card').nth(3)).toContainText('de 4');
  });
});
