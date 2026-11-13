import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright/test';
import { ADMIN, expect, login, openTask, test } from './fixtures.ts';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const EVIDENCE = path.resolve('docs/evidence');
fs.mkdirSync(EVIDENCE, { recursive: true });

/** Revisa desbordamientos, elementos fuera del viewport y superposiciones en la cabecera. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`desbordamiento horizontal: ${document.documentElement.scrollWidth}px > ${vw}px`);
    const scrollsX = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll('main *, header *, aside *'))) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if ((r.right > vw + 1 || r.left < -1) && !scrollsX(el.parentElement)) {
        problems.push(`fuera del contenedor: <${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 40)}" (${Math.round(r.left)}–${Math.round(r.right)})`);
        if (problems.length > 5) break;
      }
    }
    const items = Array.from(document.querySelectorAll('header > div:first-child > *'))
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width > 2 && x.r.height > 2);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!.r;
        const b = items[j]!.r;
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        if (overlap) problems.push(`superposición en la cabecera entre elementos ${i} y ${j}`);
      }
    }
    return problems;
  });
}

async function capture(page: Page, vp: string, screen: string, full = true): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  expect(await layoutProblems(page), `${screen} @ ${vp}`).toEqual([]);
  await expect(page).toHaveScreenshot(`${vp}-${screen}.png`, { fullPage: full });
  await page.screenshot({ path: path.join(EVIDENCE, `${vp}-${screen}.png`), fullPage: full, animations: 'disabled' });
}

for (const vp of VIEWPORTS) {
  test.describe(`Visual ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('inicio de sesión', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
      await capture(page, vp.name, '01-login', false);
    });

    test('pantallas principales', async ({ page }) => {
      await login(page, ADMIN);
      await expect(page.getByTestId('task-row').first()).toBeVisible();
      await capture(page, vp.name, '02-lista');

      await page.getByRole('tab', { name: 'Tablero' }).click();
      await expect(page.getByTestId('board')).toBeVisible();
      await capture(page, vp.name, '03-tablero');

      await page.getByRole('tab', { name: 'Carga del equipo' }).click();
      await page.getByTestId('load-row').first().getByRole('button').first().click();
      await expect(page.getByText('Tareas de Yerson esta semana')).toBeVisible();
      await capture(page, vp.name, '04-carga');

      await page.getByRole('tab', { name: 'Lista' }).click();
      await openTask(page, 'Actualización plugin de reportes');
      await expect(page.getByText('Justificación del retraso')).toBeVisible();
      await capture(page, vp.name, '05-detalle', false);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Ayuda' }).click();
      await capture(page, vp.name, '06-ayuda', false);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Semana siguiente' }).click();
      await expect(page.getByRole('heading', { name: 'Semana 46 aún no tiene tablero' })).toBeVisible();
      await capture(page, vp.name, '07-semana-nueva');

      await page.getByRole('button', { name: 'Ir a esta semana' }).click();
      await page.getByRole('button', { name: /Menú de Coordinación/ }).click();
      await page.getByRole('menuitem', { name: 'Equipo y ajustes' }).click();
      await expect(page.getByTestId('admin-user')).toHaveCount(4);
      await capture(page, vp.name, '08-equipo', false);
    });
  });
}
