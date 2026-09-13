const { test, expect } = require('@playwright/test');
const { ADMIN_TOKEN, SUFFIX, loginDocente, loginAdmin, unirseAlumno, loginCuentaAlumno, ingresarConCodigo, iniciarPartida, volverAlLobby } = require('../helpers/e2e-auth');
const { waitForAlumnoResult, waitForTimerTick, waitForTimerBarShrink } = require('../helpers/e2e-wait');

test.describe('Historia Quiz - flujo completo', () => {

  /**
   * Antes de iniciar los tests de flujo completo, asegurar que el servidor esté en estado LOBBY.
   * El test XSS en admin.spec.js puede dejar el servidor en estado pregunta.
   */
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await page.goto('/docente.html');
      await page.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
      await page.reload();
      await page.waitForFunction(() => typeof S !== 'undefined' && S.ws !== null, { timeout: 15000 });
      // Si el servidor no está en lobby, enviar volver_a_lobby
      const serverFase = await page.evaluate(async () => {
        // Esperar a que llegue estado_inicial
        return new Promise(resolve => {
          const orig = S.ws.onmessage;
          const t = setTimeout(() => { S.ws.onmessage = orig; resolve(S.fase); }, 2000);
          S.ws.onmessage = (e) => { orig(e); clearTimeout(t); resolve(S.fase); };
        });
      });
      if (serverFase && serverFase !== 'lobby') {
        await page.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
        await page.waitForFunction(() => S.pantallaActual === 'lobby', { timeout: 5000 }).catch(() => {});
      }
    } catch { /* best effort */ }
    await page.close();
  });

  test('docente se autentica y ve el lobby', async ({ page }) => {
    try {
      await page.goto('/docente.html');
      await page.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
      await page.reload();

      await expect(page.locator('#pantalla-lobby')).toBeVisible({ timeout: 10000 });
      await expect(async () => {
        const c = await page.locator('#banco-select option').count();
        expect(c).toBeGreaterThanOrEqual(3);
      }).toPass({ timeout: 10000 });
    } finally {
      try { await volverAlLobby(page).catch(() => {}); } catch {}
    }
  });

  test('flujo completo: alumno se une, docente inicia, responden y finalizan', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const nombreAlumno = `Test_${suf}`;

      // ── 1. Docente ────────────────────────────────────────────
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;

      // ── 2. Alumno ─────────────────────────────────────────────
      const a = await unirseAlumno(browser, nombreAlumno);
      alumno = a.page;

      // ── 3. Docente inicia ─────────────────────────────────────
      await iniciarPartida(docente, alumno);
      await expect(docente.locator('#pregunta-txt')).not.toHaveText('–');

      // ── 4. Alumno responde → resultado automático ─────────────
      // When there's only 1 student, answering triggers resultado immediately
      // force:true evita falsos positivos por la transición CSS all .15s
      await alumno.locator('.opcion-btn').first().click({ force: true });
      await expect(alumno.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });

      // ── 5..N. Resto de preguntas ──────────────────────────────
      // Read total question count from the badge shown on docente page
      const preguntaNumText = await docente.locator('#pregunta-num').textContent();
      const totalPregs = parseInt(preguntaNumText.split('/')[1]);
      for (let i = 1; i < totalPregs; i++) {
        await docente.locator('#btn-siguiente').click();
        await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
        await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
        await alumno.locator('.opcion-btn').first().click({ force: true });
        await expect(alumno.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
        await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
      }

      // ── 7. Fin ────────────────────────────────────────────────
      await expect(docente.locator('#btn-siguiente')).toBeEnabled({ timeout: 5000 });
      await docente.locator('#btn-siguiente').click();
      await expect(docente.locator('#pantalla-fin')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-fin')).toBeVisible({ timeout: 5000 });

      // ── 8. Recap "Mis respuestas" (REQ-UI-11, smoke) ──────────
      // El alumno respondió todas las preguntas → un item por pregunta.
      await expect(alumno.locator('#mi-historial')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#mi-historial-lista .mi-historial-item')).toHaveCount(totalPregs);
      await expect(alumno.locator('#mi-historial-lista')).toContainText('Pregunta 1');

      // Volver al lobby para dejar estado limpio
      await alumno.locator('[data-testid="btn-jugar-de-nuevo"]').click();
      await expect(alumno.locator('#s-espera')).toBeVisible({ timeout: 5000 });
      await docente.locator('[data-testid="btn-volver-menu"]').click();
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('error si el alumno usa nombre duplicado', async ({ browser }) => {
    let a1 = null;
    let a2 = null;
    try {
      const suf = SUFFIX();
      const nombre = `Dup_${suf}`;

      const first = await unirseAlumno(browser, nombre);
      a1 = first.page;
      // Con cuentas institucionales, el choque de nombre duplicado en una
      // partida ya no se prueba con "nombre libre" (dos personas eligiendo
      // el mismo texto) — el nombreUsuario de la cuenta ya es único por
      // registro. Lo que sigue vigente es: la MISMA cuenta, en una segunda
      // pestaña, intentando entrar a la partida sin ser una reconexión
      // válida (sin el token de sesión de la primera pestaña).
      a2 = await browser.newPage();
      await loginCuentaAlumno(a2, { email: first.email, password: first.password });
      await ingresarConCodigo(a2);
      await expect(a2.locator('#error-nombre')).toBeVisible({ timeout: 5000 });
    } finally {
      try { if (a1) await a1.close(); if (a2) await a2.close(); } catch {}
    }
  });

  test('alumno se reconecta después de recargar la página en el lobby', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const nombre = `Recon_${suf}`;

      const d = await loginDocente(browser);
      docente = d.page;
      const a = await unirseAlumno(browser, nombre);
      alumno = a.page;

      // Alumno recarga la página (simula cierre accidental)
      // La auto-reconexión debe volver a la sala de espera del lobby
      await alumno.reload();
      await expect(async () => {
        await expect(alumno.locator('#s-espera')).toBeVisible();
      }).toPass({ timeout: 10000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('alumno se reconecta durante una partida activa y puede seguir jugando', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    let alumnoB = null;
    try {
      const suf = SUFFIX();
      const nombre = `ReconAct_${suf}`;

      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, nombre);
      alumno = a.page;
      // Un segundo alumno mantiene la ronda viva mientras A recarga:
      // con un único alumno, su cierre sin responder cierra la ronda (R3-003)
      // y al reconectar encuentra fase RESULTADO (comportamiento correcto).
      const b = await unirseAlumno(browser, `ReconB_${suf}`);
      alumnoB = b.page;

      // Inicia la partida activa: los alumnos deben estar en pantalla de pregunta
      await iniciarPartida(docente, alumno);
      await expect(alumnoB.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });

      // Alumno recarga la página (simula cierre accidental)
      // La auto-reconexión debe devolverlo a la pregunta activa
      await alumno.reload();
      await expect(async () => {
        await expect(alumno.locator('#s-pregunta')).toBeVisible();
      }).toPass({ timeout: 10000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); if (alumnoB) await alumnoB.close(); } catch {}
    }
  });

  test('alumno recibe feedback de "pausado" al intentar responder durante la pausa', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const nombreAlumno = `Pausa_${suf}`;

      // ── 1. Docente ────────────────────────────────────────────
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;

      // ── 2. Alumno se une ──────────────────────────────────────
      const a = await unirseAlumno(browser, nombreAlumno);
      alumno = a.page;

      // ── 3. Docente inicia y entra a pregunta ──────────────────
      await iniciarPartida(docente, alumno);

      // ── 4. Docente pausa ──────────────────────────────────────
      // Cuando llega `juego_pausado` el cliente alumno deshabilita los botones
      // en el DOM, por lo que un click humano nunca llega al WS. Pero si un
      // mensaje `respuesta` quedó en vuelo (race condition, retry de un cliente
      // móvil con WS en background, etc.) el servidor ahora lo rechaza con
      // `respuesta_rechazada` razon="pausado". Simulamos ese caso enviando
      // el mensaje programáticamente: el WS ya está conectado y S.enviar está
      // expuesto por socket-client.js.
      await docente.locator('#btn-pausa').click();
      await expect(docente.locator('#btn-pausa')).toContainText('Reanudar');
      // Esperar a que el cliente alumno reciba el broadcast de pausa
      await expect(alumno.locator('#pausa-alerta')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('.opcion-btn').first()).toBeDisabled();

      // Disparar el WS message de "respuesta" que va a ser rechazado por pausado.
      // Como el broadcast de `juego_pausado` deshabilita los botones en el DOM,
      // removemos temporalmente el atributo disabled del botón para poder hacerle click
      // y gatillar la delegación de eventos.
      await alumno.evaluate(() => {
        const btn = document.querySelector('.opcion-btn');
        if (btn) btn.removeAttribute('disabled');
      });
      await alumno.locator('.opcion-btn').first().click();

      // Toast con mensaje de "pausado" debe aparecer
      await expect(alumno.locator('#toast.show')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#toast .toast-msg')).toContainText('pausado');

      // El juego sigue pausado: el docente aún ve "Reanudar"
      await expect(docente.locator('#btn-pausa')).toContainText('Reanudar');

      // ── 5. Docente reanuda ───────────────────────────────────
      await docente.locator('#btn-pausa').click();
      await expect(docente.locator('#btn-pausa')).toContainText('Pausar');

      // La pausa se levanta: la alerta visual desaparece
      await expect(alumno.locator('#pausa-alerta')).toBeHidden({ timeout: 5000 });

      // ── 6. Teardown: volver al lobby para no contaminar el siguiente test
      await docente.evaluate(() => { S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })); });
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('docente puede pausar y reanudar', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, `Alumno_${SUFFIX()}`);
      alumno = a.page;
      await iniciarPartida(docente, alumno);

      await docente.locator('#btn-pausa').click();
      await expect(docente.locator('#btn-pausa')).toContainText('Reanudar');

      await docente.locator('#btn-pausa').click();
      await expect(docente.locator('#btn-pausa')).toContainText('Pausar');
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('multi-alumno: scoring diferenciado y ranking final', async ({ browser }) => {
    let docente = null;
    const alumnos = [];
    try {
      const suf = SUFFIX();
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;

      // 3 alumnos eligen opciones distintas
      for (let i = 0; i < 3; i++) {
        const { page: p } = await unirseAlumno(browser, `A${i}_${suf}`);
        alumnos.push(p);
      }
      // Wait for exactly 3 players (stale connections from previous tests must drop first)
      await expect.poll(async () => {
        const text = await docente.locator('#count-jugadores').textContent();
        return parseInt(text);
      }, { timeout: 10000 }).toBe(3);

      // Iniciar partida
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
      for (const a of alumnos) {
        await expect(a.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      }

      // Cada alumno responde una opción distinta (0, 1, 2)
      // Wait for buttons to be present before clicking (force bypasses visibility but not initialization)
      for (const a of alumnos) {
        await expect(a.locator('.opcion-btn').first()).toBeAttached({ timeout: 3000 });
      }
      await alumnos[0].locator('.opcion-btn').first().click({ force: true });
      await alumnos[1].locator('.opcion-btn').nth(1).click({ force: true });
      await alumnos[2].locator('.opcion-btn').nth(2).click({ force: true });

      // Esperar resultado en docente (timeout generoso: server agrega 3 respuestas)
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 10000 });

      // Identificar la opción correcta desde la vista del docente
      const correctaTxt = await docente.locator('.resultado-letra.correcta').first().textContent();
      const correctaIdx = 'ABCDE'.indexOf(correctaTxt.trim());
      expect(correctaIdx).toBeGreaterThanOrEqual(0);

      // Verificar que exactamente un alumno tiene pantalla de "Correcto" y dos "Incorrecto"
      // Wait for all alumnos to render their result (WS broadcast race compensation)
      for (const a of alumnos) {
        await waitForAlumnoResult(a);
      }
      const correctos = await Promise.all(alumnos.map(a =>
        a.locator('#res-titulo').textContent().then(t => /Correcto/.test(t))
      ));
      const correctCount = correctos.filter(Boolean).length;
      expect(correctCount).toBe(1);
      const ganadorIdx = correctos.indexOf(true);
      expect(ganadorIdx).toBe(correctaIdx);

      // Verificar que el ganador tiene +100 pts
      await expect(alumnos[ganadorIdx].locator('#res-pts')).toContainText('+100');

      // Verificar que el ranking del docente muestra puntajes distintos.
      // Leemos cada <span class="ranking-pts"> por separado para evitar
      // ambigüedad cuando un nombre de alumno termina en dígito y se
      // concatena con el puntaje (e.g. "A2_bko91" + "100" → "A2_bko91100").
      const puntosTexts = await docente.locator('#ranking-lista .ranking-pts').allTextContents();
      const puntos = puntosTexts.map(s => parseInt(s.trim(), 10));
      expect(puntos).toContain(100);
      expect(puntos).toContain(0);

      // Avanzar hasta el fin
      const preguntaNumText = await docente.locator('#pregunta-num').textContent();
      const totalPregs = parseInt(preguntaNumText.split('/')[1]);
      for (let i = 1; i < totalPregs; i++) {
        await docente.locator('#btn-siguiente').click();
        await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
        for (const a of alumnos) {
          await expect(a.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
        }
        // Todos responden la primera opción para terminar rápido
        for (const a of alumnos) {
          await a.locator('.opcion-btn').first().click({ force: true });
        }
        await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
      }
      await docente.locator('#btn-siguiente').click();
      await expect(docente.locator('#pantalla-fin')).toBeVisible({ timeout: 5000 });

      // Verificar ranking final del alumno ganador
      const ganador = alumnos[ganadorIdx];
      await expect(ganador.locator('#s-fin')).toBeVisible({ timeout: 5000 });
      // El nombre del ganador debe aparecer en su ranking final
      const nombreGanador = await ganador.locator('#ranking-final .ranking-nombre').first().textContent();
      expect(ganador.locator('#ranking-final')).toContainText(nombreGanador.split(' ')[0]);
    } finally {
      // Explicitly close WS connections BEFORE closing pages so the server
      // detects disconnections immediately (avoids stale player accumulation).
      for (const a of alumnos) {
        try {
          await a.evaluate(() => { if (typeof S !== 'undefined' && S.ws) S.ws.close(); });
        } catch {}
      }
      // Give the server time to process WS close events and mark players offline
      await new Promise(r => setTimeout(r, 1000));
      // volver_a_lobby will purge the now-offline players
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); } catch {}
      for (const a of alumnos) {
        try { await a.close(); } catch {}
      }
    }
  });

  test('docente fuerza el resultado manualmente durante una pregunta', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, `Forzar_${SUFFIX()}`);
      alumno = a.page;
      await iniciarPartida(docente, alumno);

      // El botón "Terminar tiempo" debe estar habilitado durante la pregunta
      await expect(docente.locator('#btn-forzar')).toBeEnabled();

      // Forzar resultado antes de que el alumno responda
      await docente.locator('#btn-forzar').click();
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
      // Alumno que no respondió: pantalla de resultado con icono de tiempo
      await expect(alumno.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#res-icono')).toHaveText('⏰');
      await expect(alumno.locator('#res-titulo')).toContainText('Se acabó el tiempo');
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('alumno puede cambiar su nombre en la sala de espera', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const original = `Orig_${suf}`;
      const nuevo = `Nuevo_${suf}`;

      const d = await loginDocente(browser);
      docente = d.page;
      const a = await unirseAlumno(browser, original);
      alumno = a.page;
      await expect(alumno.locator('#nombre-display')).toHaveText(original);

      // Docente ve al alumno con el nombre original
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });

      // Alumno abre el editor de nombre
      await alumno.locator('#btn-cambiar-nombre').click();
      await expect(alumno.locator('#cambiar-nombre-row')).toBeVisible();
      await alumno.locator('#input-cambiar-nombre').fill(nuevo);
      await alumno.locator('#btn-confirmar-nombre').click();

      // El nombre debe actualizarse en pantalla del alumno
      await expect(alumno.locator('#nombre-display')).toHaveText(nuevo, { timeout: 3000 });
      await expect(alumno.locator('#cambiar-nombre-row')).not.toBeVisible();

      // La lista de espera del alumno debe reflejar el cambio
      await expect(alumno.locator('#lista-espera')).toContainText(nuevo);
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('alumno no puede cambiar su nombre a uno ya en uso', async ({ browser }) => {
    let docente = null;
    let a1 = null;
    let a2 = null;
    try {
      const suf = SUFFIX();
      const nombreA = `A_${suf}`;
      const nombreB = `B_${suf}`;

      const d = await loginDocente(browser);
      docente = d.page;
      const first = await unirseAlumno(browser, nombreA);
      a1 = first.page;
      const second = await unirseAlumno(browser, nombreB);
      a2 = second.page;

      // a2 intenta cambiar su nombre al de a1
      await a2.locator('#btn-cambiar-nombre').click();
      await a2.locator('#input-cambiar-nombre').fill(nombreA);
      await a2.locator('#btn-confirmar-nombre').click();

      // a2 debe permanecer con su nombre original (no se aplica el cambio)
      await expect(a2.locator('#nombre-display')).toHaveText(nombreB, { timeout: 3000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (a1) await a1.close(); if (a2) await a2.close(); } catch {}
    }
  });

  test('docente puede volver al lobby durante una pregunta activa', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, `Volver_${SUFFIX()}`);
      alumno = a.page;
      await iniciarPartida(docente, alumno);

      // Docente envía volver_a_lobby por WS durante la pregunta
      await docente.evaluate(() => {
        S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' }));
      });

      // Ambos vuelven al lobby / espera
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-espera')).toBeVisible({ timeout: 5000 });
      // El alumno sigue conectado
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('QR se renderiza en el lobby del docente', async ({ page }) => {
    try {
      await page.goto('/docente.html');
      await page.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
      await page.reload();
      await page.waitForFunction(() => typeof S !== 'undefined' && S.fase !== undefined, { timeout: 10000 });
      if (await page.evaluate(() => S.fase) !== 'lobby') {
        await page.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
      }
      await expect(page.locator('#pantalla-lobby')).toBeVisible({ timeout: 10000 });

      // El QR debe estar renderizado (la lib genera <canvas> + <img> fallback dentro de #qrcode)
      const qrHtml = await page.locator('#qrcode').innerHTML();
      expect(qrHtml.length).toBeGreaterThan(50);
      // La URL mostrada debe apuntar a alumno.html
      const urlTxt = await page.locator('#qr-url-txt').textContent();
      expect(urlTxt).toContain('/alumno.html');
    } finally {
      try { await volverAlLobby(page).catch(() => {}); } catch {}
    }
  });

  test('timer cuenta hacia atrás durante una pregunta', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, `Timer_${SUFFIX()}`);
      alumno = a.page;
      await iniciarPartida(docente, alumno);
      await expect(docente.locator('#timer-num')).toBeVisible();

      // Poll for timer tick instead of fixed waitForTimeout (server tick cadence varies)
      await waitForTimerTick(docente, { timeout: 5000 });

      // La barra también debe haber cambiado
      await waitForTimerBarShrink(docente, { timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('TIMER_EXPIRY: el resultado aparece automáticamente cuando el timer llega a 0', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;

      // Agregar opción de 5 segundos y seleccionarla
      await docente.evaluate(() => {
        const sel = document.getElementById('tiempo-select');
        const opt = document.createElement('option');
        opt.value = '5';
        opt.text = '5 segundos';
        sel.add(opt);
        sel.value = '5';
      });

      const a = await unirseAlumno(browser, `Expiry_${SUFFIX()}`);
      alumno = a.page;
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });

      // Iniciar partida con tiempoPorPregunta=5
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });

      // NO responder — esperar a que expire el timer (~5s + margen)
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 10000 });

      // Alumno debe ver resultado con icono ⏰ (se acabó el tiempo)
      // Wait for alumno result screen with content (WS broadcast race compensation)
      await waitForAlumnoResult(alumno, { timeout: 8000 });
      await expect(alumno.locator('#res-icono')).toHaveText('⏰');
      await expect(alumno.locator('#res-titulo')).toContainText('Se acabó el tiempo');
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('REINICIAR_RANKING: jugar partida, reiniciar ranking general y verificar que vuelve a 0', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const nombreAlumno = `Rank_${suf}`;

      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, nombreAlumno);
      alumno = a.page;

      // Jugar partida completa
      await iniciarPartida(docente, alumno);

      const preguntaNumText = await docente.locator('#pregunta-num').textContent();
      const totalPregs = parseInt(preguntaNumText.split('/')[1]);

      for (let i = 0; i < totalPregs; i++) {
        await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
        await alumno.locator('.opcion-btn').first().click({ force: true });
        await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
        if (i < totalPregs - 1) {
          await docente.locator('#btn-siguiente').click();
          await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
        }
      }

      // Llegar a fin del juego
      await expect(docente.locator('#btn-siguiente')).toBeEnabled({ timeout: 5000 });
      await docente.locator('#btn-siguiente').click();
      await expect(docente.locator('#pantalla-fin')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-fin')).toBeVisible({ timeout: 5000 });

      // Verificar que el ranking general tiene puntajes > 0.
      // Formato: `${nombre}${puntos}` sin separador. Buscamos al menos un número.
      await expect(docente.locator('#ranking-general-lista')).not.toContainText('Sin jugadores');
      const rankingText = await docente.locator('#ranking-general-lista').textContent();
      expect(rankingText).toMatch(/\d+/);

      // Docente hace click en "Reiniciar ranking general"
      await docente.locator('.btn-reiniciar-ranking').click();

      // Verificar que el ranking general ahora tiene todos en 0
      await expect(async () => {
        const txt = await docente.locator('#ranking-general-lista').textContent();
        const pts = [...txt.matchAll(/(\d+)\s*pts?/g)].map(m => parseInt(m[1]));
        const allZero = pts.length === 0 || pts.every(p => p === 0);
        expect(allZero).toBe(true);
      }).toPass({ timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('MULTIPLES_RONDAS: jugar partida completa, volver a lobby, iniciar otra', async ({ browser }) => {
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const nombreAlumno = `MultiR_${suf}`;

      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;
      const a = await unirseAlumno(browser, nombreAlumno);
      alumno = a.page;

      // ── Primera partida ──────────────────────────────────────────
      await iniciarPartida(docente, alumno);

      const preguntaNumText = await docente.locator('#pregunta-num').textContent();
      const totalPregs = parseInt(preguntaNumText.split('/')[1]);

      for (let i = 0; i < totalPregs; i++) {
        await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
        await alumno.locator('.opcion-btn').first().click({ force: true });
        await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
        if (i < totalPregs - 1) {
          await docente.locator('#btn-siguiente').click();
          await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
        }
      }

      // Fin de primera partida
      await expect(docente.locator('#btn-siguiente')).toBeEnabled({ timeout: 5000 });
      await docente.locator('#btn-siguiente').click();
      await expect(docente.locator('#pantalla-fin')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-fin')).toBeVisible({ timeout: 5000 });

      // Volver al lobby
      await alumno.locator('[data-testid="btn-jugar-de-nuevo"]').click();
      await expect(alumno.locator('#s-espera')).toBeVisible({ timeout: 5000 });
      await docente.locator('[data-testid="btn-volver-menu"]').click();
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 5000 });

      // ── Segunda partida ──────────────────────────────────────────
      // Seleccionar banco (posiblemente distinto)
      await expect(async () => {
        const options = await docente.locator('#banco-select option').allTextContents();
        let selectedIndex = -1;
        for (let i = 0; i < options.length; i++) {
          if (!options[i].includes('0 preg.') && !options[i].includes('Elegí un banco')) {
            selectedIndex = i;
            break;
          }
        }
        expect(selectedIndex).toBeGreaterThan(0);
        await docente.locator('#banco-select').selectOption({ index: selectedIndex });
      }).toPass({ timeout: 10000 });

      // Alumno debe estar visible en el lobby
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });

      // Iniciar segunda partida
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });

      // Responder una pregunta y verificar que funciona
      await alumno.locator('.opcion-btn').first().click({ force: true });
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
      await expect(alumno.locator('#s-resultado')).toBeVisible({ timeout: 5000 });

      // Volver a lobby para dejar estado limpio
      await docente.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('BANCO_VACIO_UI: crear banco sin preguntas desde admin e intentar iniciar en docente', async ({ browser }) => {
    let admin = null;
    let docente = null;
    let alumno = null;
    try {
      const suf = SUFFIX();
      const nombreBanco = `Vacio_${suf}`;

      // ── Admin: crear banco sin preguntas ─────────────────────────
      admin = await browser.newPage();
      await loginAdmin(admin);

      await admin.locator('.btn-nuevo-banco').click();
      await expect(admin.locator('#modal-banco')).toBeVisible({ timeout: 5000 });
      await admin.locator('#b-nombre').fill(nombreBanco);
      await admin.locator('#b-nivel').selectOption('Secundario');
      await admin.locator('#b-anio').selectOption('3°');
      await admin.locator('#b-tema').fill('Testing');
      // Click Guardar dentro del modal de banco (evitar ambigüedad con "Guardar pregunta")
      await admin.locator('#modal-banco button:has-text("Guardar")').click();
      await expect(admin.locator('#modal-banco')).not.toBeVisible({ timeout: 5000 });
      await expect(admin.locator('#banco-lista')).toContainText(nombreBanco, { timeout: 5000 });

      // ── Docente: seleccionar banco vacío e intentar iniciar ──────
      const d = await loginDocente(browser);
      docente = d.page;

      // Seleccionar el banco vacío (que tenga "0 preg." o el nombre exacto)
      await expect(async () => {
        const options = await docente.locator('#banco-select option').allTextContents();
        let selectedIndex = -1;
        for (let i = 0; i < options.length; i++) {
          if (options[i].includes(nombreBanco)) {
            selectedIndex = i;
            break;
          }
        }
        expect(selectedIndex).toBeGreaterThan(0);
        await docente.locator('#banco-select').selectOption({ index: selectedIndex });
      }).toPass({ timeout: 10000 });

      // Conectar un alumno para pasar la validación client-side de "sin alumnos"
      const a = await unirseAlumno(browser, `Alumno_${SUFFIX()}`);
      alumno = a.page;
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });

      // Click Iniciar — el servidor debe rechazar con error de banco vacío
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#error-box')).toContainText('vacío', { timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (admin) await admin.close(); if (docente) await docente.close(); if (alumno) await alumno.close(); } catch {}
    }
  });

  test('MULTI_ALUMNO_E2E: 5 alumnos conectan simultáneamente con opciones distintas', async ({ browser }) => {
    let docente = null;
    const alumnos = [];
    try {
      const suf = SUFFIX();

      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;

      // 5 alumnos conectan
      for (let i = 0; i < 5; i++) {
        const { page: p } = await unirseAlumno(browser, `A${i}_${suf}`);
        alumnos.push(p);
      }
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });

      // Iniciar partida
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
      for (const a of alumnos) {
        await expect(a.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      }

      // Cada alumno elige opción distinta (0,1,2,3,0)
      await alumnos[0].locator('.opcion-btn').first().click({ force: true });
      await alumnos[1].locator('.opcion-btn').nth(1).click({ force: true });
      await alumnos[2].locator('.opcion-btn').nth(2).click({ force: true });
      await alumnos[3].locator('.opcion-btn').nth(3).click({ force: true });
      await alumnos[4].locator('.opcion-btn').first().click({ force: true });

      // Verificar resultado visible para todos
      await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
      for (const a of alumnos) {
        await expect(a.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
      }

      // Avanzar todas las preguntas restantes
      const preguntaNumText = await docente.locator('#pregunta-num').textContent();
      const totalPregs = parseInt(preguntaNumText.split('/')[1]);
      for (let i = 1; i < totalPregs; i++) {
        await docente.locator('#btn-siguiente').click();
        await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
        for (const a of alumnos) {
          await expect(a.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
          await a.locator('.opcion-btn').first().click({ force: true });
        }
        await expect(docente.locator('#pantalla-resultado')).toBeVisible({ timeout: 5000 });
        for (const a of alumnos) {
          await expect(a.locator('#s-resultado')).toBeVisible({ timeout: 5000 });
        }
      }

      // Verificar fin visible para todos
      await docente.locator('#btn-siguiente').click();
      await expect(docente.locator('#pantalla-fin')).toBeVisible({ timeout: 5000 });
      for (const a of alumnos) {
        await expect(a.locator('#s-fin')).toBeVisible({ timeout: 5000 });
      }

      // Volver a lobby para dejar estado limpio
      await docente.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 5000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); } catch {}
      for (const a of alumnos) {
        try { await a.close(); } catch {}
      }
    }
  });

  test('OFFLINE_RECONNECT: alumno se reconecta de verdad tras perder conexión mid-game (REQ-OFF-01)', async ({ browser }) => {
    let docente = null;
    const alumnos = [];
    try {
      // ── 1. Setup: docente + DOS alumnos ─────────────────────────
      // Dos alumnos: la desconexión de UNO no puede cerrar la ronda sola
      // (el test viejo con 1 alumno era un falso positivo).
      const d = await loginDocente(browser, { seleccionarBanco: true });
      docente = d.page;

      // Skip condicional — context.setOffline está disponible desde Playwright 1.60+
      if (typeof docente.context().setOffline !== 'function') {
        test.skip(true, 'browser context.setOffline no soportado (requiere Playwright >=1.60)');
        return;
      }

      const suf = SUFFIX();
      const alumnoA = await unirseAlumno(browser, `OfflineA_${suf}`);
      const alumnoB = await unirseAlumno(browser, `OfflineB_${suf}`);
      alumnos.push(alumnoA.page, alumnoB.page);

      // ── 2. Tiempo corto (10s) para mantener runtime acotado ────
      await docente.locator('#tiempo-select').selectOption('10');

      // ── 3. Iniciar partida: pregunta activa en las 3 páginas ──
      await expect(docente.locator('#count-jugadores')).toHaveText(/[2-9]/, { timeout: 5000 });
      await docente.locator('[data-testid="btn-iniciar"]').first().click();
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });
      for (const a of alumnos) {
        await expect(a.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      }

      // ── 4. A pierde la red 3 s ─────────────────────────────────
      await alumnoA.page.context().setOffline(true);
      // Único wait fijo: la ventana offline de 3s exigida por la spec
      await alumnoA.page.waitForTimeout(3000);
      await alumnoA.page.context().setOffline(false);

      // ── 5. Reconexión REAL ─────────────────────────────────────
      // bienvenido.reconectado=true se observa vía body[data-reconectado="true"]
      // (D6). No basta "cualquier pantalla visible" — hoy nunca ocurre.
      await expect(alumnoA.page.locator('body')).toHaveAttribute('data-reconectado', 'true', { timeout: 10000 });

      // ── 6. La desconexión de UN alumno no cierra la ronda ──────
      await expect(docente.locator('#pantalla-pregunta')).toBeVisible({ timeout: 5000 });

      // ── 7. A sigue en #s-pregunta, responde y llega a #s-resultado ──
      await expect(alumnoA.page.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });
      await alumnoA.page.locator('.opcion-btn').first().click({ force: true });
      await expect(alumnoA.page.locator('#s-resultado')).toBeVisible({ timeout: 10000 });
    } finally {
      try { if (docente) await volverAlLobby(docente).catch(() => {}); } catch {}
      try { if (docente) await docente.close(); } catch {}
      for (const a of alumnos) {
        try { await a.close(); } catch {}
      }
    }
  });
});
