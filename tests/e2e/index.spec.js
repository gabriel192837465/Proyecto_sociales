const { test, expect } = require('@playwright/test');
const { ADMIN_TOKEN } = require('../helpers/e2e-auth');

test.describe('Página Principal (index.html)', () => {

  test('index.html muestra los accesos principales', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/index\.html/);
    await expect(page.locator('h1')).toContainText('Tu historia');
    await expect(page.locator('a[href="alumno.html"]')).toBeVisible();
    await expect(page.locator('a[href="docente.html"]')).toBeVisible();
    await expect(page.locator('a[href="admin.html"]')).toBeVisible();
  });

  test('docente.html NO redirige a alumno.html', async ({ page }) => {
    await page.goto('/docente.html');
    await expect(page).toHaveURL(/\/docente\.html/, { timeout: 3000 });
  });

  test('admin.html NO redirige a alumno.html', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page).toHaveURL(/\/admin\.html/, { timeout: 3000 });
  });

  test('salir de docente vuelve al inicio y al entrar pide contraseña', async ({ page }) => {
    await page.goto('/docente.html');
    await page.evaluate((token) => localStorage.setItem('admin_token', token), ADMIN_TOKEN);
    await page.reload();
    await expect(page.locator('#pantalla-lobby')).toBeVisible({ timeout: 10000 });

    await page.click('button:has-text("Salir")');
    await expect(page).toHaveURL(/\/index\.html/, { timeout: 3000 });

    await page.click('a[href="docente.html"]');
    await expect(page).toHaveURL(/\/docente\.html/);
    await expect(page.locator('#modal-auth')).toBeVisible({ timeout: 3000 });
  });
});
