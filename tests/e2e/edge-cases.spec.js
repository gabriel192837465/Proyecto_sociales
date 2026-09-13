<<<<<<< HEAD
const { test, expect } = require('@playwright/test');
const { SUFFIX, loginDocente, unirseAlumno, loginCuentaAlumno, ingresarConCodigo, volverAlLobby } = require('../helpers/e2e-auth');

test.describe('Historia Quiz — Casos de borde E2E adicionales', () => {

  test('1. Multijugador concurrente: 5 alumnos se unen y responden en paralelo', async ({ browser }) => {
    let docente = null;
    const alumnos = [];
    try {
      const suf = SUFFIX();

      // 1. Docente inicia lobby y selecciona banco
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;

      // 2. Conectar 5 alumnos en paralelo
      const nombres = Array.from({ length: 5 }, (_, i) => `Alumno_${i + 1}_${suf}`);
      for (const nom of nombres) {
        const a = await unirseAlumno(browser, nom);
        alumnos.push(a);
      }

      // 3. Verificar que el recuento de jugadores sea al menos 5
      await expect(docente.locator('#count-jugadores')).toHaveText(/[5-9]|\d{2}/, { timeout: 10000 });

      // 4. Iniciar partida
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });

      // 5. Todos los 5 alumnos responden la primera opción simultáneamente
      const respuestas = alumnos.map(a =>
        expect(a.page.locator('#s-pregunta')).toBeVisible({ timeout: 5000 }).then(async () => {
          await a.page.locator('.opcion-btn').first().click({ force: true });
          await expect(a.page.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
        })
      );
      await Promise.all(respuestas);

      // 6. Al responder todos, el docente pasa a pantalla-resultado
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
    } finally {
      for (const a of alumnos) {
        await a.cerrar().catch(() => {});
      }
      if (docente) {
        await volverAlLobby(docente).catch(() => {});
        await docente.close().catch(() => {});
      }
    }
  });

  test('2. Reconexión del Docente: recarga de página (page.reload()) durante fase pregunta', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;
      alumno = await unirseAlumno(browser, `Recarga_${suf}`);

      // Iniciar juego
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });

      // Docente recarga la página a mitad de la pregunta
      await docente.reload();

      // El cliente docente debe reconectar su WebSocket y restaurar la pantalla de la pregunta activa
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 10000 });
      await expect(docente.locator('#pregunta-txt')).not.toHaveText('–', { timeout: 10000 });
    } finally {
      if (alumno) await alumno.cerrar().catch(() => {});
      if (docente) {
        await volverAlLobby(docente).catch(() => {});
        await docente.close().catch(() => {});
      }
    }
  });

  test('3. Rechazo de nombre de usuario duplicado al registrarse (insensible a mayúsculas)', async ({ browser }) => {
    let alumno1 = null;
    let page2 = null;
    try {
      const suf = SUFFIX();
      const nombreBase = `Carlos_${suf}`;

      // Alumno 1 se registra con "Carlos_XXXX"
      alumno1 = await unirseAlumno(browser, nombreBase);

      // Alumno 2 intenta registrarse con "CARLOS_XXXX" (mismo nombreUsuario,
      // otra mayúscula/minúscula) — la cuenta ya no permite nombres de
      // usuario duplicados sin importar el caso (sección 3, UNIQUE COLLATE
      // NOCASE), así que el rechazo pasó a ocurrir en el registro, no al
      // entrar a la partida.
      page2 = await browser.newPage();
      await page2.goto('/alumno.html');
      await page2.locator('[data-action="mostrar-tab-registro"]').click();
      await page2.locator('#registro-email').fill(`otro_${suf}@alu.tecnica29de6.edu.ar`);
      await page2.locator('#registro-nombre-usuario').fill(nombreBase.toUpperCase());
      await page2.locator('#registro-password').fill('ContraseñaSegura123');
      await page2.locator('#btn-registro').click();

      await expect(page2.locator('#error-registro')).toBeVisible({ timeout: 5000 });
      await expect(page2.locator('#error-registro')).not.toBeEmpty();
    } finally {
      if (alumno1) await alumno1.cerrar().catch(() => {});
      if (page2) await page2.close().catch(() => {});
    }
  });

  test('4. Vista móvil responsiva para alumno (Smartphone 390x844)', async ({ browser }) => {
    let docente = null;
    let pageMovil = null;
    try {
      const suf = SUFFIX();
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;

      // Crear un contexto de navegador simulando un celular móvil
      const contextMovil = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      pageMovil = await contextMovil.newPage();

      await pageMovil.goto('/alumno.html');
      await pageMovil.locator('[data-action="mostrar-tab-registro"]').click();
      await pageMovil.locator('#registro-email').fill(`mobile_${suf}@alu.tecnica29de6.edu.ar`);
      await pageMovil.locator('#registro-nombre-usuario').fill(`Mobile_${suf}`);
      await pageMovil.locator('#registro-password').fill('ContraseñaSegura123');
      await pageMovil.locator('#btn-registro').click();
      await ingresarConCodigo(pageMovil);

      // Verificar pantalla de espera en móvil
      await expect(pageMovil.locator('#s-espera')).toBeVisible({ timeout: 5000 });

      // Docente inicia el juego
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });
      await docente.locator('[data-testid="btn-iniciar"]').first().click();

      // En la pantalla del celular, las 4 opciones deben ser visibles y cliqueables
      await expect(pageMovil.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      const opBtns = pageMovil.locator('.opcion-btn');
      await expect(opBtns).toHaveCount(4);

      // Hacer click en la primera opción
      await opBtns.first().click({ force: true });
      await expect(pageMovil.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
    } finally {
      if (pageMovil) await pageMovil.close().catch(() => {});
      if (docente) {
        await volverAlLobby(docente).catch(() => {});
        await docente.close().catch(() => {});
      }
    }
  });

});
=======
const { test, expect } = require('@playwright/test');
const { SUFFIX, loginDocente, unirseAlumno, volverAlLobby } = require('../helpers/e2e-auth');

test.describe('Historia Quiz — Casos de borde E2E adicionales', () => {

  test('1. Multijugador concurrente: 5 alumnos se unen y responden en paralelo', async ({ browser }) => {
    let docente = null;
    const alumnos = [];
    try {
      const suf = SUFFIX();

      // 1. Docente inicia lobby y selecciona banco
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;

      // 2. Conectar 5 alumnos en paralelo
      const nombres = Array.from({ length: 5 }, (_, i) => `Alumno_${i + 1}_${suf}`);
      for (const nom of nombres) {
        const a = await unirseAlumno(browser, nom);
        alumnos.push(a);
      }

      // 3. Verificar que el recuento de jugadores sea al menos 5
      await expect(docente.locator('#count-jugadores')).toHaveText(/[5-9]|\d{2}/, { timeout: 10000 });

      // 4. Iniciar partida
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });

      // 5. Todos los 5 alumnos responden la primera opción simultáneamente
      const respuestas = alumnos.map(a =>
        expect(a.page.locator('#s-pregunta')).toBeVisible({ timeout: 5000 }).then(async () => {
          await a.page.locator('.opcion-btn').first().click({ force: true });
          await expect(a.page.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
        })
      );
      await Promise.all(respuestas);

      // 6. Al responder todos, el docente pasa a pantalla-resultado
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
    } finally {
      for (const a of alumnos) {
        await a.cerrar().catch(() => {});
      }
      if (docente) {
        await volverAlLobby(docente).catch(() => {});
        await docente.close().catch(() => {});
      }
    }
  });

  test('2. Reconexión del Docente: recarga de página (page.reload()) durante fase pregunta', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;
      alumno = await unirseAlumno(browser, `Recarga_${suf}`);

      // Iniciar juego
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });

      // Docente recarga la página a mitad de la pregunta
      await docente.reload();

      // El cliente docente debe reconectar su WebSocket y restaurar la pantalla de la pregunta activa
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 10000 });
      await expect(docente.locator('#pregunta-txt')).not.toHaveText('–', { timeout: 10000 });
    } finally {
      if (alumno) await alumno.cerrar().catch(() => {});
      if (docente) {
        await volverAlLobby(docente).catch(() => {});
        await docente.close().catch(() => {});
      }
    }
  });

  test('3. Rechazo de nombre duplicado de alumno (insensible a mayúsculas)', async ({ browser }) => {
    let alumno1 = null;
    let page2 = null;
    try {
      const suf = SUFFIX();
      const nombreBase = `Carlos_${suf}`;

      // Alumno 1 entra con "Carlos_XXXX"
      alumno1 = await unirseAlumno(browser, nombreBase);

      // Alumno 2 intenta ingresar con "CARLOS_XXXX"
      page2 = await browser.newPage();
      await page2.goto('/alumno.html');
      await page2.locator('#input-nombre').fill(nombreBase.toUpperCase());
      await page2.locator('#btn-entrar').click();

      // Debe mostrar el mensaje de error #error-nombre y mantener la pantalla de entrada
      await expect(page2.locator('#error-nombre')).toBeVisible({ timeout: 5000 });
      await expect(page2.locator('#error-nombre')).not.toBeEmpty();
    } finally {
      if (alumno1) await alumno1.cerrar().catch(() => {});
      if (page2) await page2.close().catch(() => {});
    }
  });

  test('4. Vista móvil responsiva para alumno (Smartphone 390x844)', async ({ browser }) => {
    let docente = null;
    let pageMovil = null;
    try {
      const suf = SUFFIX();
      const d = await loginDocente(browser, { volverAlLobby: true, seleccionarBanco: true });
      docente = d.page;

      // Crear un contexto de navegador simulando un celular móvil
      const contextMovil = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      pageMovil = await contextMovil.newPage();

      await pageMovil.goto('/alumno.html');
      await pageMovil.locator('#input-nombre').fill(`Mobile_${suf}`);
      await pageMovil.locator('#btn-entrar').click();

      // Verificar pantalla de espera en móvil
      await expect(pageMovil.locator('#s-espera')).toBeVisible({ timeout: 5000 });

      // Docente inicia el juego
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });
      await docente.locator('[data-testid="btn-iniciar"]').first().click();

      // En la pantalla del celular, las 4 opciones deben ser visibles y cliqueables
      await expect(pageMovil.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      const opBtns = pageMovil.locator('.opcion-btn');
      await expect(opBtns).toHaveCount(4);

      // Hacer click en la primera opción
      await opBtns.first().click({ force: true });
      await expect(pageMovil.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
    } finally {
      if (pageMovil) await pageMovil.close().catch(() => {});
      if (docente) {
        await volverAlLobby(docente).catch(() => {});
        await docente.close().catch(() => {});
      }
    }
  });

});
>>>>>>> origin/main
