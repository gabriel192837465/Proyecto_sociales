<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
jest.mock('../../src/client/features/admin/toast', () => ({
  toast: jest.fn()
}));
const { toast: mockToast } = require('../../src/client/features/admin/toast');
const apiModule = require('../../src/client/features/admin/api');
const { state, setToken, setBancoActual } = require('../../src/client/features/admin/state');

function setupDOM() {
  document.body.innerHTML = `
    <div class="overlay" id="modal-auth"><div id="auth-error-box" style="display:none"></div><input type="password" id="auth-password"></div>
    <div class="overlay" id="modal-banco"><div class="modal-title" id="modal-banco-titulo"></div><input type="text" id="b-nombre"><select id="b-nivel"><option value="Secundario">Secundario</option></select><select id="b-anio"><option value="3°">3°</option></select><input type="text" id="b-tema"><button id="btn-borrar-banco" style="display:none"></button></div>
    <div class="overlay" id="modal-pregunta"><div class="modal-title" id="modal-preg-titulo"></div><input type="text" id="p-pregunta"><input type="text" id="p-opA"><input type="text" id="p-opB"><input type="text" id="p-opC"><input type="text" id="p-opD"><input type="text" id="p-epoca"><input type="radio" name="correcta" value="0" id="corr0"><input type="radio" name="correcta" value="1"><input type="radio" name="correcta" value="2"><input type="radio" name="correcta" value="3"><button id="btn-borrar-preg" style="display:none"></button></div>
    <div class="overlay" id="modal-import"><div id="import-csv"></div><div id="import-json" style="display:none"></div><div id="csv-preview" style="display:none"></div><div id="csv-info" style="display:none"></div><textarea id="json-input"></textarea><input type="file" id="file-csv"><div id="drop-zone"></div></div>
    <div class="overlay" id="modal-test"></div>
    <div class="toast" id="toast"></div>
    <div id="banco-lista"></div>
    <div id="main-content"></div>
    <select id="mobile-banco-select"></select>
  `;
  window.confirm = jest.fn(() => true);
  mockToast.mockClear();
  setToken('test-token');
  setBancoActual(null);
  global.fetch = undefined;
}

function okRes(body) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function mockFetch(status, body) {
  const response = status >= 200 && status < 300
    ? { ok: true, status, json: () => Promise.resolve(body) }
    : { ok: false, status, json: () => Promise.resolve(body) };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response)
    .mockResolvedValue(okRes([]));
}

function mockFetchError(status, body) {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body) })
    .mockResolvedValue(okRes([]));
}

function mockFetchAll(body) {
  global.fetch = jest.fn().mockResolvedValue(okRes(body));
}

describe('admin/api', () => {
  beforeEach(() => {
    setupDOM();
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('escapeHTML', () => {
    test('escapa todos los caracteres', () => {
      expect(apiModule.escapeHTML('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#039;');
    });
    test('maneja null/undefined', () => {
      expect(apiModule.escapeHTML(null)).toBe('');
      expect(apiModule.escapeHTML(undefined)).toBe('');
    });
  });

  describe('autenticarAdmin', () => {
    test('password vacío muestra error', async () => {
      document.getElementById('auth-password').value = '';
      await apiModule.autenticarAdmin();
      expect(document.getElementById('auth-error-box').style.display).toBe('block');
      expect(document.getElementById('auth-error-box').textContent).toContain('vacía');
    });

    test('éxito setea token y cierra modal', async () => {
      document.getElementById('auth-password').value = 'mypass';
      mockFetch(200, [{ id: 'b1' }]);
      await apiModule.autenticarAdmin();
      expect(state.token).toBe('mypass');
    });

    test('clave incorrecta muestra error', async () => {
      document.getElementById('auth-password').value = 'wrong';
      mockFetchError(401, {});
      await apiModule.autenticarAdmin();
      expect(document.getElementById('auth-error-box').textContent).toContain('Clave incorrecta');
    });

    test('error de conexión muestra error', async () => {
      document.getElementById('auth-password').value = 'mypass';
      global.fetch = jest.fn().mockRejectedValue(new Error('NetworkError'));
      await apiModule.autenticarAdmin();
      expect(document.getElementById('auth-error-box').textContent).toContain('conexión');
    });
  });

  describe('cargarSidebar', () => {
    test('carga bancos en sidebar y select', async () => {
      mockFetch(200, [{ id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', cantidad: 5 }]);
      await apiModule.cargarSidebar();
      expect(document.getElementById('banco-lista').innerHTML).toContain('Test');
      expect(document.getElementById('mobile-banco-select').innerHTML).toContain('Test');
    });

    test('muestra empty state cuando no hay bancos', async () => {
      mockFetch(200, []);
      await apiModule.cargarSidebar();
      expect(document.getElementById('banco-lista').innerHTML).toContain('No hay bancos');
    });

    test('maneja 401 abriendo modal-auth', async () => {
      mockFetchError(401, {});
      await apiModule.cargarSidebar();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });
  });

  describe('seleccionarBanco', () => {
    test('id vacío no hace nada', async () => {
      await apiModule.seleccionarBanco('');
      expect(state.bancoActualId).toBeNull();
    });

    test('carga banco y renderiza main', async () => {
      const banco = { id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', preguntas: [{ id: 'p1', pregunta: '¿?', opciones: ['A','B','C','D'], correcta: 0, epoca: 'G' }] };
      mockFetch(200, banco);
      await apiModule.seleccionarBanco('b1');
      expect(state.bancoActualId).toBe('b1');
      expect(document.getElementById('main-content').innerHTML).toContain('Test');
    });

    test('maneja 401', async () => {
      mockFetchError(401, {});
      await apiModule.seleccionarBanco('b1');
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error de fetch', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('NetworkError'));
      await apiModule.seleccionarBanco('b1');
      expect(mockToast).toHaveBeenCalledWith('Error al cargar el banco', 'err');
    });
  });

  describe('abrirModalBanco', () => {
    test('nuevo limpia campos', () => {
      apiModule.abrirModalBanco();
      expect(document.getElementById('modal-banco').classList.contains('visible')).toBe(true);
      expect(document.getElementById('modal-banco-titulo').textContent).toBe('Nuevo banco de preguntas');
    });

    test('edición existente (bancosCache find)', () => {
      state.bancosCache.length = 0;
      state.bancosCache.push({ id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', cantidad: 5 });
      apiModule.abrirModalBanco('b1');
      expect(document.getElementById('modal-banco-titulo').textContent).toBe('Editar banco');
    });
  });

  describe('guardarBanco', () => {
    test('nombre vacío muestra error', async () => {
      document.getElementById('b-nombre').value = '';
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('El nombre es obligatorio', 'err');
    });

    test('nombre corto muestra error', async () => {
      document.getElementById('b-nombre').value = 'ab';
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('El nombre debe tener al menos 3 caracteres', 'err');
    });

    test('create exitoso', async () => {
      document.getElementById('b-nombre').value = 'Nuevo banco';
      document.getElementById('b-tema').value = 'Tema';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: 'b2' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b2', nombre: 'Nuevo banco', nivel: 'S', anio: '3°', tema: 'T', cantidad: 0 }]))
        .mockResolvedValueOnce(okRes({ id: 'b2', nombre: 'Nuevo banco', preguntas: [] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('Banco creado ✓');
    });

    test('update exitoso', async () => {
      document.getElementById('b-nombre').value = 'Editado';
      document.getElementById('b-tema').value = 'Tema';
      document.getElementById('modal-banco').dataset.editId = 'b1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'b1' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Editado', cantidad: 5 }]))
        .mockResolvedValueOnce(okRes({ id: 'b1', nombre: 'Editado', preguntas: [] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('Banco actualizado ✓');
    });

    test('maneja 401', async () => {
      document.getElementById('b-nombre').value = 'Test';
      mockFetchError(401, {});
      await apiModule.guardarBanco();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error genérico', async () => {
      document.getElementById('b-nombre').value = 'Test';
      mockFetchError(500, { error: 'Server error' });
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('Server error', 'err');
    });
  });

  describe('borrarBanco', () => {
    test('confirm cancelado no borra', async () => {
      global.fetch = jest.fn();
      window.confirm.mockReturnValueOnce(false);
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      await apiModule.borrarBanco();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('elimina exitosamente', async () => {
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Test', cantidad: 0 }]))
        .mockResolvedValue(okRes([]));
      await apiModule.borrarBanco();
      expect(mockToast).toHaveBeenCalledWith('Banco eliminado', 'err');
    });

    test('maneja 401', async () => {
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
        .mockResolvedValue(okRes([]));
      await apiModule.borrarBanco();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error genérico', async () => {
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
      await apiModule.borrarBanco();
      expect(mockToast).toHaveBeenCalledWith('Error al eliminar el banco', 'err');
    });
  });

  describe('abrirModalPregunta', () => {
    test('nueva pregunta', async () => {
      setBancoActual('b1');
      await apiModule.abrirModalPregunta('b1');
      expect(document.getElementById('modal-pregunta').classList.contains('visible')).toBe(true);
      expect(document.getElementById('modal-preg-titulo').textContent).toBe('Nueva pregunta');
      expect(state.pregEditandoId).toBeNull();
    });

    test('edita pregunta existente', async () => {
      setBancoActual('b1');
      mockFetch(200, { id: 'b1', preguntas: [{ id: 'p1', pregunta: '¿Test?', opciones: ['A','B','C','D'], correcta: 0, epoca: 'G' }] });
      await apiModule.abrirModalPregunta('b1', 'p1');
      expect(document.getElementById('p-pregunta').value).toBe('¿Test?');
      expect(document.getElementById('modal-preg-titulo').textContent).toBe('Editar pregunta');
    });

    test('edita sin datos de pregunta', async () => {
      setBancoActual('b1');
      mockFetch(200, { id: 'b1', preguntas: [] });
      await apiModule.abrirModalPregunta('b1', 'p_inexistente');
      expect(document.getElementById('p-pregunta').value).toBe('');
    });
  });

  describe('guardarPregunta', () => {
    beforeEach(() => {
      state.pregEditandoId = null;
      document.getElementById('p-pregunta').value = '¿Pregunta de prueba?';
      document.getElementById('p-opA').value = 'A';
      document.getElementById('p-opB').value = 'B';
      document.getElementById('p-opC').value = 'C';
      document.getElementById('p-opD').value = 'D';
      document.getElementById('p-epoca').value = 'General';
      document.getElementById('corr0').checked = true;
      setBancoActual('b1');
    });

    test('pregunta vacía', async () => {
      document.getElementById('p-pregunta').value = '';
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('La pregunta es obligatoria', 'err');
    });

    test('pregunta muy corta', async () => {
      document.getElementById('p-pregunta').value = 'abc';
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('La pregunta debe tener al menos 5 caracteres', 'err');
    });

    test('opción faltante', async () => {
      document.getElementById('p-opA').value = '';
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('Completá todas las opciones', 'err');
    });

    test('create exitoso', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: 'p_new' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Test', cantidad: 5 }]))
        .mockResolvedValueOnce(okRes({ id: 'b1', preguntas: [{ id: 'p_new' }] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('Pregunta agregada ✓');
    });

    test('update exitoso', async () => {
      state.pregEditandoId = 'p1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'p1' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Test', cantidad: 5 }]))
        .mockResolvedValueOnce(okRes({ id: 'b1', preguntas: [{ id: 'p1' }] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('Pregunta actualizada ✓');
    });

    test('maneja 401', async () => {
      mockFetchError(401, {});
      await apiModule.guardarPregunta();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error genérico', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('fail', 'err');
    });
  });

  describe('confirmarBorrarPregunta', () => {
    test('cancelado no borra', async () => {
      window.confirm.mockReturnValueOnce(false);
      mockFetch(200, { ok: true });
      await apiModule.confirmarBorrarPregunta('b1', 'p1');
      expect(mockToast).not.toHaveBeenCalled();
    });

    test('elimina exitosamente', async () => {
      mockFetch(200, { ok: true });
      await apiModule.confirmarBorrarPregunta('b1', 'p1');
      expect(mockToast).toHaveBeenCalledWith('Pregunta eliminada', 'err');
    });

    test('maneja 401', async () => {
      mockFetchError(401, {});
      await apiModule.confirmarBorrarPregunta('b1', 'p1');
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });
  });

  describe('borrarPregunta', () => {
    test('borra y cierra modal', async () => {
      setBancoActual('b1');
      state.pregEditandoId = 'p1';
      mockFetch(200, { ok: true });
      await apiModule.borrarPregunta();
      expect(document.getElementById('modal-pregunta').classList.contains('visible')).toBe(false);
    });
  });

  describe('abrirModalImport / switchImport', () => {
    test('abre modal con preview oculto', () => {
      apiModule.abrirModalImport();
      expect(document.getElementById('modal-import').classList.contains('visible')).toBe(true);
      expect(document.getElementById('csv-preview').style.display).toBe('none');
    });

    test('switchImport a json', () => {
      apiModule.switchImport('json');
      expect(document.getElementById('import-csv').style.display).toBe('none');
      expect(document.getElementById('import-json').style.display).toBe('block');
    });

    test('switchImport a csv', () => {
      apiModule.switchImport('csv');
      expect(document.getElementById('import-csv').style.display).toBe('block');
      expect(document.getElementById('import-json').style.display).toBe('none');
    });
  });

  describe('importar', () => {
    test('sin banco seleccionado', async () => {
      setBancoActual(null);
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('Seleccioná un banco primero', 'err');
    });

    test('CSV sin texto', async () => {
      setBancoActual('b1');
      state.importMode = 'csv';
      state.csvTexto = '';
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('Seleccioná un archivo CSV', 'err');
    });

    test('CSV exitoso', async () => {
      setBancoActual('b1');
      state.importMode = 'csv';
      state.csvTexto = 'csv data';
      mockFetch(200, { importadas: 2 });
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('✓ 2 preguntas importadas');
    });

    test('JSON vacío muestra error', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = '';
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('El JSON está vacío', 'err');
    });

    test('JSON inválido muestra error', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = 'not json';
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('JSON inválido', 'err');
    });

    test('JSON exitoso', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = JSON.stringify([{ pregunta: '¿?', opciones: ['A','B','C','D'], correcta: 0 }]);
      mockFetch(200, { importadas: 1 });
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('✓ 1 preguntas importadas');
    });

    test('JSON resultado sin importadas muestra error', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = '[]';
      mockFetch(200, { error: 'Formato inválido' });
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('Formato inválido', 'err');
    });

    test('JSON lanza 401', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = '[]';
      mockFetchError(401, {});
      await apiModule.importar();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });
  });

  describe('cerrarModal', () => {
    test('cierra modal', () => {
      const el = document.getElementById('modal-test');
      el.classList.add('visible');
      apiModule.cerrarModal('modal-test');
      expect(el.classList.contains('visible')).toBe(false);
    });
  });
});
=======
/**
 * @jest-environment jsdom
 */
jest.mock('../../src/client/features/admin/toast', () => ({
  toast: jest.fn()
}));
const { toast: mockToast } = require('../../src/client/features/admin/toast');
const apiModule = require('../../src/client/features/admin/api');
const { state, setToken, setBancoActual } = require('../../src/client/features/admin/state');

function setupDOM() {
  document.body.innerHTML = `
    <div class="overlay" id="modal-auth"><div id="auth-error-box" style="display:none"></div><input type="password" id="auth-password"></div>
    <div class="overlay" id="modal-banco"><div class="modal-title" id="modal-banco-titulo"></div><input type="text" id="b-nombre"><select id="b-nivel"><option value="Secundario">Secundario</option></select><select id="b-anio"><option value="3°">3°</option></select><input type="text" id="b-tema"><button id="btn-borrar-banco" style="display:none"></button></div>
    <div class="overlay" id="modal-pregunta"><div class="modal-title" id="modal-preg-titulo"></div><input type="text" id="p-pregunta"><input type="text" id="p-opA"><input type="text" id="p-opB"><input type="text" id="p-opC"><input type="text" id="p-opD"><input type="text" id="p-epoca"><input type="radio" name="correcta" value="0" id="corr0"><input type="radio" name="correcta" value="1"><input type="radio" name="correcta" value="2"><input type="radio" name="correcta" value="3"><button id="btn-borrar-preg" style="display:none"></button></div>
    <div class="overlay" id="modal-import"><div id="import-csv"></div><div id="import-json" style="display:none"></div><div id="csv-preview" style="display:none"></div><div id="csv-info" style="display:none"></div><textarea id="json-input"></textarea><input type="file" id="file-csv"><div id="drop-zone"></div></div>
    <div class="overlay" id="modal-test"></div>
    <div class="toast" id="toast"></div>
    <div id="banco-lista"></div>
    <div id="main-content"></div>
    <select id="mobile-banco-select"></select>
  `;
  window.confirm = jest.fn(() => true);
  mockToast.mockClear();
  setToken('test-token');
  setBancoActual(null);
  global.fetch = undefined;
}

function okRes(body) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function mockFetch(status, body) {
  const response = status >= 200 && status < 300
    ? { ok: true, status, json: () => Promise.resolve(body) }
    : { ok: false, status, json: () => Promise.resolve(body) };
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response)
    .mockResolvedValue(okRes([]));
}

function mockFetchError(status, body) {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body) })
    .mockResolvedValue(okRes([]));
}

function mockFetchAll(body) {
  global.fetch = jest.fn().mockResolvedValue(okRes(body));
}

describe('admin/api', () => {
  beforeEach(() => {
    setupDOM();
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('escapeHTML', () => {
    test('escapa todos los caracteres', () => {
      expect(apiModule.escapeHTML('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#039;');
    });
    test('maneja null/undefined', () => {
      expect(apiModule.escapeHTML(null)).toBe('');
      expect(apiModule.escapeHTML(undefined)).toBe('');
    });
  });

  describe('autenticarAdmin', () => {
    test('password vacío muestra error', async () => {
      document.getElementById('auth-password').value = '';
      await apiModule.autenticarAdmin();
      expect(document.getElementById('auth-error-box').style.display).toBe('block');
      expect(document.getElementById('auth-error-box').textContent).toContain('vacía');
    });

    test('éxito setea token y cierra modal', async () => {
      document.getElementById('auth-password').value = 'mypass';
      mockFetch(200, [{ id: 'b1' }]);
      await apiModule.autenticarAdmin();
      expect(state.token).toBe('mypass');
    });

    test('clave incorrecta muestra error', async () => {
      document.getElementById('auth-password').value = 'wrong';
      mockFetchError(401, {});
      await apiModule.autenticarAdmin();
      expect(document.getElementById('auth-error-box').textContent).toContain('Clave incorrecta');
    });

    test('error de conexión muestra error', async () => {
      document.getElementById('auth-password').value = 'mypass';
      global.fetch = jest.fn().mockRejectedValue(new Error('NetworkError'));
      await apiModule.autenticarAdmin();
      expect(document.getElementById('auth-error-box').textContent).toContain('conexión');
    });
  });

  describe('cargarSidebar', () => {
    test('carga bancos en sidebar y select', async () => {
      mockFetch(200, [{ id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', cantidad: 5 }]);
      await apiModule.cargarSidebar();
      expect(document.getElementById('banco-lista').innerHTML).toContain('Test');
      expect(document.getElementById('mobile-banco-select').innerHTML).toContain('Test');
    });

    test('muestra empty state cuando no hay bancos', async () => {
      mockFetch(200, []);
      await apiModule.cargarSidebar();
      expect(document.getElementById('banco-lista').innerHTML).toContain('No hay bancos');
    });

    test('maneja 401 abriendo modal-auth', async () => {
      mockFetchError(401, {});
      await apiModule.cargarSidebar();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });
  });

  describe('seleccionarBanco', () => {
    test('id vacío no hace nada', async () => {
      await apiModule.seleccionarBanco('');
      expect(state.bancoActualId).toBeNull();
    });

    test('carga banco y renderiza main', async () => {
      const banco = { id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', preguntas: [{ id: 'p1', pregunta: '¿?', opciones: ['A','B','C','D'], correcta: 0, epoca: 'G' }] };
      mockFetch(200, banco);
      await apiModule.seleccionarBanco('b1');
      expect(state.bancoActualId).toBe('b1');
      expect(document.getElementById('main-content').innerHTML).toContain('Test');
    });

    test('maneja 401', async () => {
      mockFetchError(401, {});
      await apiModule.seleccionarBanco('b1');
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error de fetch', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('NetworkError'));
      await apiModule.seleccionarBanco('b1');
      expect(mockToast).toHaveBeenCalledWith('Error al cargar el banco', 'err');
    });
  });

  describe('abrirModalBanco', () => {
    test('nuevo limpia campos', () => {
      apiModule.abrirModalBanco();
      expect(document.getElementById('modal-banco').classList.contains('visible')).toBe(true);
      expect(document.getElementById('modal-banco-titulo').textContent).toBe('Nuevo banco de preguntas');
    });

    test('edición existente (bancosCache find)', () => {
      state.bancosCache.length = 0;
      state.bancosCache.push({ id: 'b1', nombre: 'Test', nivel: 'S', anio: '3°', tema: 'H', cantidad: 5 });
      apiModule.abrirModalBanco('b1');
      expect(document.getElementById('modal-banco-titulo').textContent).toBe('Editar banco');
    });
  });

  describe('guardarBanco', () => {
    test('nombre vacío muestra error', async () => {
      document.getElementById('b-nombre').value = '';
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('El nombre es obligatorio', 'err');
    });

    test('nombre corto muestra error', async () => {
      document.getElementById('b-nombre').value = 'ab';
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('El nombre debe tener al menos 3 caracteres', 'err');
    });

    test('create exitoso', async () => {
      document.getElementById('b-nombre').value = 'Nuevo banco';
      document.getElementById('b-tema').value = 'Tema';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: 'b2' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b2', nombre: 'Nuevo banco', nivel: 'S', anio: '3°', tema: 'T', cantidad: 0 }]))
        .mockResolvedValueOnce(okRes({ id: 'b2', nombre: 'Nuevo banco', preguntas: [] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('Banco creado ✓');
    });

    test('update exitoso', async () => {
      document.getElementById('b-nombre').value = 'Editado';
      document.getElementById('b-tema').value = 'Tema';
      document.getElementById('modal-banco').dataset.editId = 'b1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'b1' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Editado', cantidad: 5 }]))
        .mockResolvedValueOnce(okRes({ id: 'b1', nombre: 'Editado', preguntas: [] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('Banco actualizado ✓');
    });

    test('maneja 401', async () => {
      document.getElementById('b-nombre').value = 'Test';
      mockFetchError(401, {});
      await apiModule.guardarBanco();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error genérico', async () => {
      document.getElementById('b-nombre').value = 'Test';
      mockFetchError(500, { error: 'Server error' });
      await apiModule.guardarBanco();
      expect(mockToast).toHaveBeenCalledWith('Server error', 'err');
    });
  });

  describe('borrarBanco', () => {
    test('confirm cancelado no borra', async () => {
      global.fetch = jest.fn();
      window.confirm.mockReturnValueOnce(false);
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      await apiModule.borrarBanco();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('elimina exitosamente', async () => {
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Test', cantidad: 0 }]))
        .mockResolvedValue(okRes([]));
      await apiModule.borrarBanco();
      expect(mockToast).toHaveBeenCalledWith('Banco eliminado', 'err');
    });

    test('maneja 401', async () => {
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
        .mockResolvedValue(okRes([]));
      await apiModule.borrarBanco();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error genérico', async () => {
      document.getElementById('btn-borrar-banco').dataset.id = 'b1';
      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
      await apiModule.borrarBanco();
      expect(mockToast).toHaveBeenCalledWith('Error al eliminar el banco', 'err');
    });
  });

  describe('abrirModalPregunta', () => {
    test('nueva pregunta', async () => {
      setBancoActual('b1');
      await apiModule.abrirModalPregunta('b1');
      expect(document.getElementById('modal-pregunta').classList.contains('visible')).toBe(true);
      expect(document.getElementById('modal-preg-titulo').textContent).toBe('Nueva pregunta');
      expect(state.pregEditandoId).toBeNull();
    });

    test('edita pregunta existente', async () => {
      setBancoActual('b1');
      mockFetch(200, { id: 'b1', preguntas: [{ id: 'p1', pregunta: '¿Test?', opciones: ['A','B','C','D'], correcta: 0, epoca: 'G' }] });
      await apiModule.abrirModalPregunta('b1', 'p1');
      expect(document.getElementById('p-pregunta').value).toBe('¿Test?');
      expect(document.getElementById('modal-preg-titulo').textContent).toBe('Editar pregunta');
    });

    test('edita sin datos de pregunta', async () => {
      setBancoActual('b1');
      mockFetch(200, { id: 'b1', preguntas: [] });
      await apiModule.abrirModalPregunta('b1', 'p_inexistente');
      expect(document.getElementById('p-pregunta').value).toBe('');
    });
  });

  describe('guardarPregunta', () => {
    beforeEach(() => {
      state.pregEditandoId = null;
      document.getElementById('p-pregunta').value = '¿Pregunta de prueba?';
      document.getElementById('p-opA').value = 'A';
      document.getElementById('p-opB').value = 'B';
      document.getElementById('p-opC').value = 'C';
      document.getElementById('p-opD').value = 'D';
      document.getElementById('p-epoca').value = 'General';
      document.getElementById('corr0').checked = true;
      setBancoActual('b1');
    });

    test('pregunta vacía', async () => {
      document.getElementById('p-pregunta').value = '';
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('La pregunta es obligatoria', 'err');
    });

    test('pregunta muy corta', async () => {
      document.getElementById('p-pregunta').value = 'abc';
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('La pregunta debe tener al menos 5 caracteres', 'err');
    });

    test('opción faltante', async () => {
      document.getElementById('p-opA').value = '';
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('Completá todas las opciones', 'err');
    });

    test('create exitoso', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 201, json: () => Promise.resolve({ id: 'p_new' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Test', cantidad: 5 }]))
        .mockResolvedValueOnce(okRes({ id: 'b1', preguntas: [{ id: 'p_new' }] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('Pregunta agregada ✓');
    });

    test('update exitoso', async () => {
      state.pregEditandoId = 'p1';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'p1' }) })
        .mockResolvedValueOnce(okRes([{ id: 'b1', nombre: 'Test', cantidad: 5 }]))
        .mockResolvedValueOnce(okRes({ id: 'b1', preguntas: [{ id: 'p1' }] }))
        .mockResolvedValue(okRes([]));
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('Pregunta actualizada ✓');
    });

    test('maneja 401', async () => {
      mockFetchError(401, {});
      await apiModule.guardarPregunta();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });

    test('maneja error genérico', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
      await apiModule.guardarPregunta();
      expect(mockToast).toHaveBeenCalledWith('fail', 'err');
    });
  });

  describe('confirmarBorrarPregunta', () => {
    test('cancelado no borra', async () => {
      window.confirm.mockReturnValueOnce(false);
      mockFetch(200, { ok: true });
      await apiModule.confirmarBorrarPregunta('b1', 'p1');
      expect(mockToast).not.toHaveBeenCalled();
    });

    test('elimina exitosamente', async () => {
      mockFetch(200, { ok: true });
      await apiModule.confirmarBorrarPregunta('b1', 'p1');
      expect(mockToast).toHaveBeenCalledWith('Pregunta eliminada', 'err');
    });

    test('maneja 401', async () => {
      mockFetchError(401, {});
      await apiModule.confirmarBorrarPregunta('b1', 'p1');
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });
  });

  describe('borrarPregunta', () => {
    test('borra y cierra modal', async () => {
      setBancoActual('b1');
      state.pregEditandoId = 'p1';
      mockFetch(200, { ok: true });
      await apiModule.borrarPregunta();
      expect(document.getElementById('modal-pregunta').classList.contains('visible')).toBe(false);
    });
  });

  describe('abrirModalImport / switchImport', () => {
    test('abre modal con preview oculto', () => {
      apiModule.abrirModalImport();
      expect(document.getElementById('modal-import').classList.contains('visible')).toBe(true);
      expect(document.getElementById('csv-preview').style.display).toBe('none');
    });

    test('switchImport a json', () => {
      apiModule.switchImport('json');
      expect(document.getElementById('import-csv').style.display).toBe('none');
      expect(document.getElementById('import-json').style.display).toBe('block');
    });

    test('switchImport a csv', () => {
      apiModule.switchImport('csv');
      expect(document.getElementById('import-csv').style.display).toBe('block');
      expect(document.getElementById('import-json').style.display).toBe('none');
    });
  });

  describe('importar', () => {
    test('sin banco seleccionado', async () => {
      setBancoActual(null);
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('Seleccioná un banco primero', 'err');
    });

    test('CSV sin texto', async () => {
      setBancoActual('b1');
      state.importMode = 'csv';
      state.csvTexto = '';
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('Seleccioná un archivo CSV', 'err');
    });

    test('CSV exitoso', async () => {
      setBancoActual('b1');
      state.importMode = 'csv';
      state.csvTexto = 'csv data';
      mockFetch(200, { importadas: 2 });
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('✓ 2 preguntas importadas');
    });

    test('JSON vacío muestra error', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = '';
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('El JSON está vacío', 'err');
    });

    test('JSON inválido muestra error', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = 'not json';
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('JSON inválido', 'err');
    });

    test('JSON exitoso', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = JSON.stringify([{ pregunta: '¿?', opciones: ['A','B','C','D'], correcta: 0 }]);
      mockFetch(200, { importadas: 1 });
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('✓ 1 preguntas importadas');
    });

    test('JSON resultado sin importadas muestra error', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = '[]';
      mockFetch(200, { error: 'Formato inválido' });
      await apiModule.importar();
      expect(mockToast).toHaveBeenCalledWith('Formato inválido', 'err');
    });

    test('JSON lanza 401', async () => {
      setBancoActual('b1');
      state.importMode = 'json';
      document.getElementById('json-input').value = '[]';
      mockFetchError(401, {});
      await apiModule.importar();
      expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(true);
    });
  });

  describe('cerrarModal', () => {
    test('cierra modal', () => {
      const el = document.getElementById('modal-test');
      el.classList.add('visible');
      apiModule.cerrarModal('modal-test');
      expect(el.classList.contains('visible')).toBe(false);
    });
  });
});
>>>>>>> origin/main
