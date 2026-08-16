const { test, expect } = require('@playwright/test');

test.describe('Página Principal (index.html)', () => {

  test('index.html redirige a alumno.html', async ({ page }) => {
    // Dejar que la redirección automática ocurra
    await page.goto('/index.html');
    
    // Verificar que eventualmente redirija a alumno.html
    await expect(page).toHaveURL(/\/alumno\.html/, { timeout: 6000 });
  });

  test('docente.html NO redirige a alumno.html', async ({ page }) => {
    await page.goto('/docente.html');
    await expect(page).toHaveURL(/\/docente\.html/, { timeout: 3000 });
  });

  test('admin.html NO redirige a alumno.html', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page).toHaveURL(/\/admin\.html/, { timeout: 3000 });
  });
});
