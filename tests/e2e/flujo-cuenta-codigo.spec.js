const { test, expect } = require('@playwright/test');
const {
  ADMIN_TOKEN,
  SUFFIX,
  loginDocente,
  volverAlLobby,
  selectBancoConPreguntas,
  registrarCuentaAlumno,
  loginCuentaAlumno,
  ingresarConCodigo,
} = require('../helpers/e2e-auth');

/**
 * Flujo E2E obligatorio (sección 29 del pedido de refactor):
 *
 *  1. alumno crea cuenta institucional
 *  2. alumno inicia sesión
 *  3. docente inicia sesión
 *  4. docente crea partida
 *  5. servidor genera código
 *  6. alumno introduce código
 *  7. alumno entra
 *  8. segundo alumno entra
 *  9. docente comienza
 * 10. aparece pregunta 1
 * 11. alumnos responden
 * 12. aparece resultado
 * 13. siguiente pregunta automática (autoavance — NO se toca "Siguiente")
 * 14. repetir hasta la última
 * 15. mostrar ranking final
 *
 * A diferencia del resto de la suite (que usa el flujo legacy de entrada
 * libre con un código dummy, ver `unirseAlumno`), este spec ejercita el
 * mecanismo REAL de código de 6 dígitos: el docente llama a `crear_partida`
 * y los alumnos deben usar el código que devuelve el servidor.
 */
test.describe('E2E obligatorio — cuenta institucional + código de partida', () => {

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await page.goto('/docente.html');
      await page.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
      await page.reload();
      await page.waitForFunction(() => typeof S !== 'undefined' && S.ws !== null, { timeout: 15000 });
      await volverAlLobby(page);
    } catch { /* best effort */ }
    await page.close();
  });

  test('flujo completo: cuenta -> login -> código real -> juego -> autoavance -> ranking final', async ({ browser }) => {
    let docente = null;
    let alumnoA = null;
    let alumnoB = null;

    try {
      const suf = SUFFIX();

      // ── 1-3. Docente inicia sesión, selecciona banco ───────────────
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;

      // ── 4-5. Docente crea la partida → código real de 6 dígitos ────
      await docente.locator('[data-testid="btn-crear-partida"]').click();
      await expect(docente.locator('#codigo-partida-txt')).toContainText(/\d{6}/, { timeout: 5000 });
      const codigoTxt = await docente.locator('#codigo-partida-txt').textContent();
      const codigo = codigoTxt.match(/\d{6}/)[0];
      expect(codigo).toMatch(/^\d{6}$/);

      // ── 1-2. Alumno A: crea cuenta institucional y ENTRA (registro
      //         ya deja la sesión iniciada, como pide la sección 3) ──
      alumnoA = await browser.newPage();
      const credencialesA = await registrarCuentaAlumno(alumnoA, `E2EA_${suf}`);

      // ── 6-7. Alumno A entra con el código REAL de la partida ───────
      await ingresarConCodigo(alumnoA, codigo);
      await expect(alumnoA.locator('#s-espera')).toBeVisible({ timeout: 5000 });

      // Verifica también el login explícito (paso 2 del flujo obligatorio):
      // cerrar sesión y volver a entrar con las mismas credenciales.
      await alumnoA.locator('#btn-cerrar-sesion').click();
      await expect(alumnoA.locator('#s-cuenta')).toBeVisible({ timeout: 5000 });
      await loginCuentaAlumno(alumnoA, credencialesA);
      await expect(alumnoA.locator('#cuenta-nombre-display')).toHaveText(`E2EA_${suf}`);
      await ingresarConCodigo(alumnoA, codigo);
      await expect(alumnoA.locator('#s-espera')).toBeVisible({ timeout: 5000 });

      // ── 8. Segundo alumno entra con el mismo código ────────────────
      alumnoB = await browser.newPage();
      await registrarCuentaAlumno(alumnoB, `E2EB_${suf}`);
      await ingresarConCodigo(alumnoB, codigo);
      await expect(alumnoB.locator('#s-espera')).toBeVisible({ timeout: 5000 });

      // Un código incorrecto debe rechazarse (sección 8/11) — probado con
      // una tercera sesión efímera, sin afectar a A/B.
      const alumnoC = await browser.newPage();
      await registrarCuentaAlumno(alumnoC, `E2EC_${suf}`);
      await ingresarConCodigo(alumnoC, '000001' === codigo ? '000002' : '000001');
      await expect(alumnoC.locator('#error-nombre')).toBeVisible({ timeout: 5000 });
      await expect(alumnoC.locator('#error-nombre')).toContainText('Código de partida inválido o finalizado.');
      await alumnoC.close();

      // ── 9-10. Docente comienza → pregunta 1 ────────────────────────
      await expect(docente.locator('#count-jugadores')).toHaveText(/[2-9]/, { timeout: 5000 });
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
      await expect(alumnoA.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      await expect(alumnoB.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });

      const preguntaNumText = await docente.locator('#pregunta-num').textContent();
      const totalPregs = parseInt(preguntaNumText.split('/')[1], 10);

      // ── 11-14. Responden y el juego avanza SOLO (autoavance servidor,
      //           sección 15/17) — nunca se toca "Siguiente pregunta" ──
      for (let i = 0; i < totalPregs; i++) {
        await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 10000 });
        await alumnoA.locator('.opcion-btn').first().click({ force: true });
        await alumnoB.locator('.opcion-btn').first().click({ force: true });

        await expect(alumnoA.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
        await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });

        if (i < totalPregs - 1) {
          // No se hace clic en ningún botón: el servidor debe avanzar solo
          // ~2.5s después de mostrar el resultado.
          await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 8000 });
          await expect(alumnoA.locator('#s-pregunta')).toBeVisible({ timeout: 8000 });
        } else {
          // Última pregunta: el autoavance debe llevar a la pantalla de fin.
          await expect(docente.locator('#pantalla-fin')).toBeVisible({ timeout: 8000 });
        }
      }

      // ── 15. Ranking final ───────────────────────────────────────────
      await expect(alumnoA.locator('#s-fin')).toBeVisible({ timeout: 8000 });
      await expect(alumnoA.locator('#ranking-final')).toContainText(`E2EA_${suf}`);
      await expect(alumnoA.locator('#ranking-final')).toContainText(`E2EB_${suf}`);
      await expect(docente.locator('#ranking-lista')).toContainText(`E2EA_${suf}`);
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); } catch {}
      try { if (alumnoA) await alumnoA.close(); } catch {}
      try { if (alumnoB) await alumnoB.close(); } catch {}
    }
  });
});
