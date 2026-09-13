const { test, expect } = require('@playwright/test');
const { ADMIN_TOKEN, SUFFIX, loginAdmin, registrarCuentaAlumno, ingresarConCodigo } = require('../helpers/e2e-auth');

test.describe('Administración - Bancos de Preguntas', () => {

  test('autenticación de admin con token correcto', async ({ page }) => {
    await loginAdmin(page);

    // Verificar que el modal de autenticación no aparezca
    await expect(page.locator('#modal-auth')).not.toBeVisible({ timeout: 5000 });
    // Verificar que la interfaz de admin cargue
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Bancos de Preguntas');
  });

  test('autenticación fallida sin token', async ({ page }) => {
    await page.goto('/admin.html');
    
    // Verificar que el modal de autenticación aparezca
    await expect(page.locator('#modal-auth')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#modal-auth')).toContainText('Acceso de Administración');
  });

  test('listar bancos de preguntas', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que cargue la lista de bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });
    
    // Verificar que haya al menos un banco en la lista
    const bancoItems = page.locator('#banco-lista .banco-item');
    await expect(bancoItems.first()).toBeVisible({ timeout: 5000 });
  });

  test('crear un nuevo banco de preguntas', async ({ page }) => {
    const suf = SUFFIX();
    const nombreBanco = `Banco Test ${suf}`;

    await loginAdmin(page);

    // Abrir modal de nuevo banco
    await page.click('.btn-nuevo-banco');
    await expect(page.locator('#modal-banco')).toBeVisible();

    // Llenar formulario
    await page.fill('#b-nombre', nombreBanco);
    await page.selectOption('#b-nivel', 'Secundario');
    await page.selectOption('#b-anio', '3°');
    await page.fill('#b-tema', 'Historia Argentina');

    // Guardar
    await page.click('button:has-text("Guardar")');
    
    // Verificar que el modal se cierre
    await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });

    // Verificar que el banco aparezca en la lista
    await expect(page.locator('#banco-lista')).toContainText(nombreBanco, { timeout: 5000 });

    // Seleccionar el banco recién creado
    await page.click(`#banco-lista .banco-item:has-text("${nombreBanco}")`);
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Agregar una pregunta para que el banco no esté vacío
    await page.click('button:has-text("Nueva pregunta")');
    await page.click('#modal-tipo-pregunta button[data-tipo="multiple_choice"]');
    await expect(page.locator('#modal-pregunta')).toBeVisible();

    await page.fill('#p-pregunta', '¿Pregunta de prueba?');
    await page.fill('#p-opA', 'Opción A');
    await page.fill('#p-opB', 'Opción B');
    await page.fill('#p-opC', 'Opción C');
    await page.fill('#p-opD', 'Opción D');
    await page.click('input[name="correcta"][value="0"]');

    await page.click('button:has-text("Guardar pregunta")');
    await expect(page.locator('#modal-pregunta')).not.toBeVisible({ timeout: 3000 });

    // Verificar que la pregunta se agregó
    await expect(page.locator('.tabla-preguntas tbody')).toContainText('Pregunta de prueba', { timeout: 5000 });
  });

  test('editar un banco existente', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Seleccionar el primer banco
    await page.click('#banco-lista .banco-item:first-child');
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Hacer clic en editar banco (botón de editar en el header)
    await page.click('button:has-text("Editar banco")');
    await expect(page.locator('#modal-banco')).toBeVisible();

    // Modificar el nombre
    const nuevoNombre = `Banco Editado ${SUFFIX()}`;
    await page.fill('#b-nombre', nuevoNombre);

    // Guardar
    await page.click('button:has-text("Guardar")');
    await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });

    // Verificar que el nombre se actualizó
    await expect(page.locator('#main-content')).toContainText(nuevoNombre, { timeout: 5000 });
  });

  test('eliminar un banco', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Contar bancos antes
    let countBefore = await page.locator('#banco-lista .banco-item').count();

    // Solo eliminar si hay pocos bancos para no dejar la DB vacía
    if (countBefore <= 3) {
      await page.click('.btn-nuevo-banco');
      await expect(page.locator('#modal-banco')).toBeVisible();
      await page.fill('#b-nombre', `Banco Temporal ${SUFFIX()}`);
      await page.click('button:has-text("Guardar")');
      await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });
      await page.waitForTimeout(1000);
      // actualizar contador después de crear el temporal
      countBefore = await page.locator('#banco-lista .banco-item').count();
    }

    // Seleccionar el último banco (menos probable que sea usado por otros tests)
    const bancoItems = await page.locator('#banco-lista .banco-item').count();
    await page.click(`#banco-lista .banco-item:nth-child(${bancoItems})`);
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Abrir modal de edición
    await page.click('button:has-text("Editar banco")');
    await expect(page.locator('#modal-banco')).toBeVisible();

    // Hacer clic en eliminar y aceptar el diálogo de confirmación
    page.on('dialog', dialog => dialog.accept());
    await page.click('#btn-borrar-banco');

    // Verificar que el modal se cierre
    await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });

    // Verificar que el banco ya no esté en la lista
    await expect(page.locator('#banco-lista .banco-item')).toHaveCount(countBefore - 1, { timeout: 5000 });
  });

  test('crear una pregunta en un banco', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Seleccionar el primer banco
    await page.click('#banco-lista .banco-item:first-child');
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Contar preguntas antes (están en una tabla)
    const countBefore = await page.locator('.tabla-preguntas tbody tr:has(td)').count();

    // Abrir modal de nueva pregunta
    await page.click('button:has-text("Nueva pregunta")');
    await page.click('#modal-tipo-pregunta button[data-tipo="multiple_choice"]');
    await expect(page.locator('#modal-pregunta')).toBeVisible();

    // Llenar formulario
    await page.fill('#p-pregunta', '¿Cuál fue la fecha de la Revolución de Mayo?');
    await page.fill('#p-opA', '25 de Mayo de 1810');
    await page.fill('#p-opB', '9 de Julio de 1816');
    await page.fill('#p-opC', '20 de Septiembre de 1810');
    await page.fill('#p-opD', '17 de Octubre de 1945');
    await page.click('input[name="correcta"][value="0"]');
    await page.fill('#p-epoca', 'Independencia');

    // Guardar
    await page.click('button:has-text("Guardar pregunta")');
    await expect(page.locator('#modal-pregunta')).not.toBeVisible({ timeout: 3000 });

    // Verificar que la pregunta aparezca
    await expect(page.locator('.tabla-preguntas tbody tr:has(td)')).toHaveCount(countBefore + 1, { timeout: 5000 });
    await expect(page.locator('.tabla-preguntas tbody')).toContainText('Revolución de Mayo', { timeout: 5000 });
  });

  test('editar una pregunta existente', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Seleccionar el primer banco
    await page.click('#banco-lista .banco-item:first-child');
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Esperar a que haya preguntas en la tabla
    await expect(page.locator('.tabla-preguntas tbody tr').first()).toBeVisible({ timeout: 5000 });

    // Hacer clic en el botón de editar de la primera pregunta
    await page.click('.tabla-preguntas tbody tr:first-child button:has-text("✏️")');
    await expect(page.locator('#modal-pregunta')).toBeVisible();

    // Modificar la pregunta
    const nuevaPregunta = `Pregunta editada ${SUFFIX()}`;
    await page.fill('#p-pregunta', nuevaPregunta);

    // Guardar
    await page.click('button:has-text("Guardar pregunta")');
    await expect(page.locator('#modal-pregunta')).not.toBeVisible({ timeout: 3000 });

    // Verificar que la pregunta se actualizó
    await expect(page.locator('.tabla-preguntas tbody')).toContainText(nuevaPregunta, { timeout: 5000 });
  });

  test('eliminar una pregunta', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Seleccionar el primer banco
    await page.click('#banco-lista .banco-item:first-child');
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Esperar a que haya preguntas en la tabla
    await expect(page.locator('.tabla-preguntas tbody tr').first()).toBeVisible({ timeout: 5000 });

    // Contar preguntas antes
    const countBefore = await page.locator('.tabla-preguntas tbody tr').count();

    // Hacer clic en el botón de eliminar de la primera pregunta
    page.on('dialog', dialog => dialog.accept());
    await page.click('.tabla-preguntas tbody tr:first-child button:has-text("🗑")');

    // Verificar que la pregunta se eliminó
    await expect(page.locator('.tabla-preguntas tbody tr')).toHaveCount(countBefore - 1, { timeout: 5000 });
  });

  test('importar preguntas desde CSV', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Seleccionar el primer banco
    await page.click('#banco-lista .banco-item:first-child');
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Contar preguntas antes
    const countBefore = await page.locator('.tabla-preguntas tbody tr').count();

    // Abrir modal de importación
    await page.click('button:has-text("Importar")');
    await expect(page.locator('#modal-import')).toBeVisible();

    // Subir archivo CSV real mediante el input de archivo
    const csvContent = `pregunta;opcionA;opcionB;opcionC;opcionD;correcta;epoca
"¿Cuándo fue la Revolución de Mayo?";"25 de Mayo de 1810";"9 de Julio de 1816";"20 de Septiembre de 1810";"17 de Octubre de 1945";A;Independencia
"¿Quién fue el primer presidente?";"Rivadavia";"San Martín";"Belgrano";"Moreno";A;Independencia`;

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#drop-zone').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'preguntas.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    // Esperar a que se procese el CSV
    await expect(page.locator('#csv-info')).toContainText('2 preguntas detectadas', { timeout: 5000 });

    // Importar (botón dentro del modal)
    await page.click('#modal-import button:has-text("Importar")');
    await expect(page.locator('#modal-import')).not.toBeVisible({ timeout: 3000 });

    // Verificar que se importaron las preguntas
    await expect(page.locator('.tabla-preguntas tbody tr')).toHaveCount(countBefore + 2);
  });

  test('importar preguntas desde JSON', async ({ page }) => {
    await loginAdmin(page);

    // Esperar a que carguen los bancos
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    // Seleccionar el primer banco
    await page.click('#banco-lista .banco-item:first-child');
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Contar preguntas antes
    const countBefore = await page.locator('.tabla-preguntas tbody tr').count();

    // Abrir modal de importación
    await page.click('button:has-text("Importar")');
    await expect(page.locator('#modal-import')).toBeVisible();

    // Switch a JSON tab
    await page.click('.import-tab:has-text("JSON")');
    await expect(page.locator('#import-json')).toBeVisible();

    // Pegar JSON de ejemplo
    const jsonContent = JSON.stringify({
      preguntas: [
        {
          pregunta: '¿Cuál fue la capital del Virreinato del Río de la Plata?',
          opciones: ['Buenos Aires', 'Montevideo', 'Lima', 'Santiago'],
          correcta: 0,
          epoca: 'Virreinato'
        },
        {
          pregunta: '¿En qué año se declaró la independencia?',
          opciones: ['1810', '1816', '1820', '1815'],
          correcta: 1,
          epoca: 'Independencia'
        }
      ]
    });

    await page.fill('#json-input', jsonContent);

    // Importar (botón dentro del modal)
    await page.click('#modal-import button:has-text("Importar")');
    await expect(page.locator('#modal-import')).not.toBeVisible({ timeout: 3000 });

    // Verificar que se importaron las preguntas
    await expect(page.locator('.tabla-preguntas tbody tr')).toHaveCount(countBefore + 2, { timeout: 5000 });
  });

  test('cerrar sesión de admin', async ({ page }) => {
    await loginAdmin(page);

    // Verificar que estamos logueados
    await expect(page.locator('.sidebar')).toBeVisible();

    // Cerrar sesión
    await page.click('button:has-text("Salir")');

    // Verificar que vuelve a la pantalla pública sin pedir credenciales
    await expect(page).toHaveURL(/\/index\.html/, { timeout: 3000 });
    await expect(page.locator('#modal-auth')).toHaveCount(0);
  });

  test('contenido HTML en preguntas se renderiza como texto (sin XSS)', async ({ browser, page }) => {
    let docente = null;
    let alumno = null;
    try {
      // 1) Crear banco + pregunta con payload XSS desde el panel admin
      await loginAdmin(page);

      const suf = SUFFIX();
      const nombreBanco = `Banco XSS ${suf}`;
      const xssPayload = '<img src=x onerror=window.__xss=1><script>window.__xss=2</script>';

      await page.click('.btn-nuevo-banco');
      await page.fill('#b-nombre', nombreBanco);
      await page.click('button:has-text("Guardar")');
      await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });
      await expect(page.locator('#banco-lista')).toContainText(nombreBanco, { timeout: 5000 });

      // Crear pregunta con payload XSS en el texto y en las opciones
      await page.click(`#banco-lista .banco-item:has-text("${nombreBanco}")`);
      await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });
      await page.click('button:has-text("Nueva pregunta")');
      await page.click('#modal-tipo-pregunta button[data-tipo="multiple_choice"]');
      await expect(page.locator('#modal-pregunta')).toBeVisible();
      await page.fill('#p-pregunta', `¿Pregunta XSS? ${xssPayload}`);
      await page.fill('#p-opA', `Opción A ${xssPayload}`);
      await page.fill('#p-opB', 'Opción B segura');
      await page.fill('#p-opC', 'Opción C segura');
      await page.fill('#p-opD', 'Opción D segura');
      await page.click('input[name="correcta"][value="0"]');
      await page.click('button:has-text("Guardar pregunta")');
      await expect(page.locator('#modal-pregunta')).not.toBeVisible({ timeout: 3000 });

      // intentionally not refactored: XSS test needs docente as nullable var with custom cleanup
      docente = await browser.newPage();
      await docente.goto('/docente.html');
      await docente.evaluate((t) => localStorage.setItem('admin_token', t), ADMIN_TOKEN);
      await docente.reload();
      await docente.waitForFunction(() => typeof S !== 'undefined' && S.fase !== undefined, { timeout: 10000 });
      if (await docente.evaluate(() => S.fase) !== 'lobby') {
        await docente.evaluate(() => S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
        await docente.waitForFunction(() => S.pantallaActual === 'lobby', { timeout: 5000 }).catch(() => {});
      }
      await expect(docente.locator('#pantalla-lobby')).toBeVisible({ timeout: 10000 });

      // Seleccionar el banco recién creado por su nombre en el dropdown
      await expect(async () => {
        const options = await docente.locator('#banco-select option').allTextContents();
        const idx = options.findIndex(t => t.includes(nombreBanco));
        expect(idx).toBeGreaterThan(0);
        await docente.locator('#banco-select').selectOption({ index: idx });
      }).toPass({ timeout: 10000 });
      await expect(docente.locator('#banco-meta')).toContainText('1');

      alumno = await browser.newPage();
      await registrarCuentaAlumno(alumno, `XSS_${suf}`);
      await ingresarConCodigo(alumno);
      await expect(alumno.locator('#s-espera')).toBeVisible({ timeout: 5000 });
      await expect(docente.locator('#count-jugadores')).toHaveText(/[1-9]/, { timeout: 5000 });

      await docente.locator('button:has-text("Iniciar")').first().click();
      await expect(alumno.locator('#s-pregunta')).toBeVisible({ timeout: 5000 });

      // El payload debe estar en el DOM como TEXTO, no como HTML
      const preguntaText = await alumno.locator('#pregunta-txt').textContent();
      expect(preguntaText).toContain(xssPayload);
      // El <img> malicioso NO debe haberse inyectado
      const injectedImg = await alumno.locator('#pregunta-txt img').count();
      expect(injectedImg).toBe(0);
      // window.__xss no debe haberse seteado
      const xssFlag = await alumno.evaluate(() => window.__xss);
      expect(xssFlag).toBeUndefined();

      // Verificar que el banco del docente también escapa el nombre (en la lista de bancos)
      const bancoItem = page.locator(`#banco-lista .banco-item:has-text("${nombreBanco}")`);
      // El payload no debe haberse inyectado como HTML en el banco-item
      const bancoItemImgs = await bancoItem.locator('img').count();
      expect(bancoItemImgs).toBe(0);
      // El nombre del banco (que es texto plano, sin payload) sí debe estar visible
      await expect(bancoItem).toBeVisible();
    } finally {
      // SIEMPRE: volver al lobby y borrar el banco, incluso si el test falló
      try {
        if (docente) {
          const fase = await docente.evaluate(() => S.fase).catch(() => null);
          if (fase && fase !== 'lobby') {
            await docente.evaluate(() => S.ws && S.ws.send(JSON.stringify({ tipo: 'volver_a_lobby' })));
            // Esperar a que el docente muestre el lobby (S.pantallaActual === 'lobby')
            await docente.waitForFunction(() => S.pantallaActual === 'lobby', { timeout: 5000 }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
      try {
        if (docente) await docente.close();
        if (alumno) await alumno.close();
      } catch { /* ignore */ }
      try {
        await loginAdmin(page);
        await page.locator(`#banco-lista .banco-item:has-text("${'Banco XSS'}")`).first().click().catch(() => {});
        const editBtn = page.locator('button:has-text("Editar banco")');
        if (await editBtn.isVisible().catch(() => false)) {
          await editBtn.click();
          await page.locator('#modal-banco').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
          page.once('dialog', d => d.accept());
          await page.click('#btn-borrar-banco');
        }
      } catch { /* ignore */ }
    }
  });

  test('CSV con líneas malformadas: se omiten y el resto se importa', async ({ page }) => {
    await loginAdmin(page);
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });

    const suf = SUFFIX();
    const nombreBanco = `Banco CSV ${suf}`;
    await page.click('.btn-nuevo-banco');
    await page.fill('#b-nombre', nombreBanco);
    await page.click('button:has-text("Guardar")');
    await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('#banco-lista')).toContainText(nombreBanco, { timeout: 5000 });
    await page.click(`#banco-lista .banco-item:has-text("${nombreBanco}")`);
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // CSV: header + 1 línea válida + 2 inválidas (pocas columnas y letra incorrecta)
    const csvContent = `pregunta;opcionA;opcionB;opcionC;opcionD;correcta;epoca
"¿Valida?";"A";"B";"C";"D";A;Epoca
"línea con pocas columnas"
"¿Letra mala?";"A";"B";"C";"D";Z;Epoca`;

    // Obtener el ID del banco recién creado (el endpoint espera el ID, no el nombre)
    const bancoId = await page.evaluate((nombre) => {
      const items = document.querySelectorAll('#banco-lista .banco-item');
      for (const el of items) {
        if (el.textContent.includes(nombre)) return el.dataset.bancoId;
      }
      return null;
    }, nombreBanco);
    expect(bancoId).toBeTruthy();

    // 1) Verificar el comportamiento del servidor: las líneas malformadas se omiten
    const result = await page.evaluate(async ({ id, csv }) => {
      const r = await fetch(`/api/bancos/${encodeURIComponent(id)}/importar-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'historia' },
        body: JSON.stringify({ csv })
      });
      return { status: r.status, body: await r.json() };
    }, { id: bancoId, csv: csvContent });
    expect(result.status).toBe(200);
    expect(result.body.importadas).toBe(1);
    expect(result.body.omitidas).toBe(2);

    // 2) Verificar el flujo de UI: solo la pregunta válida se importa y aparece en la tabla
    await page.reload();
    await expect(page.locator('#banco-lista')).not.toContainText('Cargando...', { timeout: 10000 });
    await page.click(`#banco-lista .banco-item:has-text("${nombreBanco}")`);
    await expect(page.locator('#main-content')).not.toContainText('Seleccioná un banco', { timeout: 5000 });

    // Verificar que la pregunta válida está presente y las inválidas no
    await expect(page.locator('.tabla-preguntas tbody')).toContainText('¿Valida?', { timeout: 5000 });
    await expect(page.locator('.tabla-preguntas tbody')).not.toContainText('línea con pocas columnas');
    await expect(page.locator('.tabla-preguntas tbody')).not.toContainText('¿Letra mala?');

    // 3) Probar también a través del modal de import (UI completa)
    await page.click('button:has-text("Importar")');
    await expect(page.locator('#modal-import')).toBeVisible();
    const csvContent2 = `pregunta;opcionA;opcionB;opcionC;opcionD;correcta;epoca
"¿Vía modal?";"A";"B";"C";"D";A;Epoca
"basura sin columnas"`;
    const fcPromise = page.waitForEvent('filechooser');
    await page.locator('#drop-zone').click();
    const fc = await fcPromise;
    await fc.setFiles({ name: 'm.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent2, 'utf-8') });
    await expect(page.locator('#csv-info')).toContainText('2 preguntas detectadas', { timeout: 5000 });
    await page.click('#modal-import button:has-text("Importar")');
    await expect(page.locator('#modal-import')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('#toast')).toContainText(/importadas?/, { timeout: 5000 });
    await expect(page.locator('.tabla-preguntas tbody')).toContainText('¿Vía modal?');

    // Cleanup
    await page.click(`#banco-lista .banco-item:has-text("${nombreBanco}")`);
    await page.click('button:has-text("Editar banco")');
    await expect(page.locator('#modal-banco')).toBeVisible();
    page.once('dialog', d => d.accept());
    await page.click('#btn-borrar-banco');
    await expect(page.locator('#modal-banco')).not.toBeVisible({ timeout: 3000 });
  });

  test('token incorrecto en localStorage redirige al modal de autenticación', async ({ page }) => {
    await page.goto('/admin.html');
    await page.evaluate(() => localStorage.setItem('admin_token', 'token-claramente-invalido'));
    await page.reload();

    // La app cree estar autenticada al inicio, pero al fallar la primera petición
    // se limpia el token y se muestra el modal de auth
    await expect(page.locator('#modal-auth')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#auth-password')).toBeVisible();
    // El token fue removido del localStorage
    const stored = await page.evaluate(() => localStorage.getItem('admin_token'));
    expect(stored).toBeNull();

    // Y al intentar autenticarse con el token incorrecto vía el modal, debe fallar
    await page.fill('#auth-password', 'otro-token-invalido');
    await page.click('#modal-auth button:has-text("Entrar")');
    await expect(page.locator('#auth-error-box')).toContainText('incorrecta', { timeout: 3000 });
  });
});
