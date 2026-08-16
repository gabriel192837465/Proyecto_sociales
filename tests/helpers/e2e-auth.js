/**
 * @file E2E authentication and setup helpers for Playwright tests.
 * Extracts duplicated auth/lobby patterns from game.spec.js and admin.spec.js.
 *
 * @module e2e-auth
 */

const { expect } = require('@playwright/test');

const ADMIN_TOKEN = process.env.HISTORIA_ADMIN_TOKEN || 'historia';

/**
 * Returns a random 4-character suffix for unique test names.
 * @returns {string}
 */
const SUFFIX = () => Math.random().toString(36).slice(2, 6);

/**
 * Logs in as docente (creates a new page, sets token, ensures lobby state).
 *
 * @param {import('@playwright/test').Browser} browser - Playwright browser instance
 * @param {object} [options]
 * @param {boolean} [options.volverAlLobby=true] - If the server is not in lobby, send volver_a_lobby via WS
 * @param {boolean} [options.seleccionarBanco=false] - Also select a bank with questions
 * @returns {Promise<{page: import('@playwright/test').Page, cerrar: Function, banco: object|null}>}
 */
async function loginDocente(browser, options = {}) {
  const { volverAlLobby = true, seleccionarBanco = false } = options;
  const page = await browser.newPage();
  const cerrar = () => page.close();

  await page.goto('/docente.html');
  await page.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
  await page.reload();

  // Wait for WebSocket connection and initial state
  await page.waitForFunction(
    () => typeof S !== 'undefined' && S.ws !== null && S.fase !== undefined,
    { timeout: 10000 }
  );

  // Force lobby if requested and server is in a different phase
  if (volverAlLobby) {
    const fase = await page.evaluate(() => S.fase);
    if (fase !== 'lobby') {
      await page.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
      await page.waitForFunction(() => S.pantallaActual === 'lobby', { timeout: 5000 }).catch(() => {});
    }
  }

  await expect(page.locator('#pantalla-lobby')).toBeVisible({ timeout: 10000 });

  let banco = null;
  if (seleccionarBanco) {
    await selectBancoConPreguntas(page);
  }

  return { page, cerrar, banco };
}

/**
 * Logs in as admin on an existing page. Navigates to /admin.html, sets the token,
 * reloads, and waits for the bank list to load.
 *
 * @param {import('@playwright/test').Page} page - An existing Playwright page
 * @returns {Promise<void>}
 */
async function loginAdmin(page) {
  await page.goto('/admin.html');
  await page.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
  await page.reload();
  await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });
}

/**
 * Forces the server back to lobby state via WebSocket if not already there.
 * Safe to call regardless of current state.
 *
 * @param {import('@playwright/test').Page} page - Docente page
 * @returns {Promise<void>}
 */
async function volverAlLobby(page) {
  const fase = await page.evaluate(() => typeof S !== 'undefined' ? S.fase : null);
  if (fase && fase !== 'lobby') {
    await page.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
    await page.waitForFunction(() => S.pantallaActual === 'lobby', { timeout: 5000 }).catch(() => {});
  }
}

/**
 * Selects a bank with questions from the docente's dropdown. Uses toPass pattern
 * with 10s timeout to handle async option rendering.
 *
 * @param {import('@playwright/test').Page} page - Docente page in lobby
 * @param {object} [options]
 * @param {string} [options.porNombre] - If set, selects the bank whose text matches
 * @returns {Promise<void>}
 * @throws {Error} If no suitable bank is found within 10s
 */
async function selectBancoConPreguntas(page, options = {}) {
  const { porNombre } = options;

  await expect(async () => {
    const optionTexts = await page.locator('#banco-select option').allTextContents();
    let selectedIndex = -1;

    for (let i = 0; i < optionTexts.length; i++) {
      const txt = optionTexts[i];
      // Skip placeholder and empty-bank options
      if (txt.includes('0 preg.') || txt.includes('Elegí un banco')) continue;
      // If porNombre is specified, only match that bank
      if (porNombre && !txt.includes(porNombre)) continue;
      selectedIndex = i;
      break;
    }

    expect(selectedIndex).toBeGreaterThan(0);
    await page.locator('#banco-select').selectOption({ index: selectedIndex });
  }).toPass({ timeout: 10000 });
}

/**
 * Creates a new alumno page, navigates to /alumno.html, fills the name,
 * clicks Enter, and waits for the waiting room screen.
 *
 * @param {import('@playwright/test').Browser} browser - Playwright browser instance
 * @param {string} nombre - Alumno display name
 * @returns {Promise<{page: import('@playwright/test').Page, cerrar: Function, nombre: string}>}
 */
async function unirseAlumno(browser, nombre) {
  const page = await browser.newPage();
  const cerrar = () => page.close();

  await page.goto('/alumno.html');
  await page.locator('#input-nombre').fill(nombre);
  await page.locator('#btn-entrar').click();
  await expect(page.locator('#s-espera')).toBeVisible({ timeout: 5000 });

  return { page, cerrar, nombre };
}

/**
 * Starts a game: waits for at least one player, clicks Iniciar, and waits
 * for the question screen on both docente and alumno pages.
 *
 * @param {import('@playwright/test').Page} docente - Docente page
 * @param {import('@playwright/test').Page} alumno - Alumno page
 * @returns {Promise<void>}
 */
async function iniciarPartida(docente, alumno) {
  await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });
  await docente.locator('[data-testid="btn-iniciar"]').first().click();
  await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
  await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
}

module.exports = {
  ADMIN_TOKEN,
  SUFFIX,
  loginDocente,
  loginAdmin,
  volverAlLobby,
  selectBancoConPreguntas,
  unirseAlumno,
  iniciarPartida
};
