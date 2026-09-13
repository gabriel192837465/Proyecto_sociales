<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
const { state, setToken, clearToken } = require('../../src/client/features/admin/state');

function baseHTML() {
  return `
    <div class="overlay" id="modal-auth" style="display:none"></div>
    <div class="overlay" id="modal-banco" style="display:none"></div>
    <div class="toast" id="toast"></div>
    <div id="banco-lista"></div>
    <div id="drop-zone"></div>
    <input type="file" id="file-csv">
  `;
}

describe('admin/index', () => {
  beforeEach(() => {
    document.body.innerHTML = baseHTML();
    window.toast = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([])
    });
  });

  afterEach(() => {
    delete global.DataTransfer;
    jest.useRealTimers();
  });

  describe('toast', () => {
    test('muestra y oculta mensaje', () => {
      jest.useFakeTimers();
      const mod = require('../../src/client/features/admin/index');
      const el = document.getElementById('toast');
      mod.toast('test ok');
      expect(el.textContent).toBe('test ok');
      expect(el.className).toContain('show');
      jest.advanceTimersByTime(2800);
      expect(el.className).toBe('toast');
    });

    test('toast con tipo err', () => {
      const mod = require('../../src/client/features/admin/index');
      mod.toast('error', 'err');
      expect(document.getElementById('toast').className).toContain('err');
    });
  });

  describe('init', () => {
    test('sin modal-auth no hace nada', () => {
      document.body.innerHTML = '<div></div>';
      jest.isolateModules(() => {
        require('../../src/client/features/admin/index');
      });
    });

    test('sin token muestra modal de auth', () => {
      jest.isolateModules(() => {
        const { clearToken: ct } = require('../../src/client/features/admin/state');
        ct();
        require('../../src/client/features/admin/index');
        const authModal = document.getElementById('modal-auth');
        expect(authModal.classList.contains('visible')).toBe(true);
      });
    });

    test('con token oculta modal y carga sidebar', () => {
      jest.isolateModules(() => {
        const { setToken: st } = require('../../src/client/features/admin/state');
        st('valid-token');
        require('../../src/client/features/admin/index');
        expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(false);
      });
    });
  });

  describe('cerrarSesion', () => {
    test('limpia localStorage', () => {
      const mod = require('../../src/client/features/admin/index');
      setToken('test');
      window.cerrarSesion();
      expect(localStorage.getItem('admin_token')).toBeNull();
    });
  });

  describe('drag & drop', () => {
    test('event listeners se agregan al cargar modulo', () => {
      jest.isolateModules(() => {
        const mod = require('../../src/client/features/admin/index');
        const dz = document.getElementById('drop-zone');
        const dragOver = new Event('dragover');
        dz.dispatchEvent(dragOver);
        expect(dz.classList.contains('drag')).toBe(true);
        const dragLeave = new Event('dragleave');
        dz.dispatchEvent(dragLeave);
        expect(dz.classList.contains('drag')).toBe(false);
      });
    });

    test('drop procesa archivo', () => {
      jest.isolateModules(() => {
        const inp = document.getElementById('file-csv');
        Object.defineProperty(inp, 'files', { writable: true, configurable: true, value: [] });
        global.DataTransfer = class {
          constructor() { this.items = { add: jest.fn() }; }
          get files() { return []; }
        };
        const mod = require('../../src/client/features/admin/index');
        const dz = document.getElementById('drop-zone');
        const file = new File(['csv content'], 'test.csv');
        const event = new Event('drop');
        event.preventDefault = jest.fn();
        event.dataTransfer = { files: [file] };
        dz.dispatchEvent(event);
      });
    });
  });

  describe('overlay click', () => {
    test('click en overlay no-auth cierra modal', () => {
      jest.isolateModules(() => {
        require('../../src/client/features/admin/index');
        const overlay = document.getElementById('modal-banco');
        overlay.classList.add('visible');
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(overlay.classList.contains('visible')).toBe(false);
      });
    });

    test('click en overlay auth no cierra', () => {
      jest.isolateModules(() => {
        require('../../src/client/features/admin/index');
        const overlay = document.getElementById('modal-auth');
        overlay.classList.add('visible');
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(overlay.classList.contains('visible')).toBe(true);
      });
    });
  });
});
=======
/**
 * @jest-environment jsdom
 */
const { state, setToken, clearToken } = require('../../src/client/features/admin/state');

function baseHTML() {
  return `
    <div class="overlay" id="modal-auth" style="display:none"></div>
    <div class="overlay" id="modal-banco" style="display:none"></div>
    <div class="toast" id="toast"></div>
    <div id="banco-lista"></div>
    <div id="drop-zone"></div>
    <input type="file" id="file-csv">
  `;
}

describe('admin/index', () => {
  beforeEach(() => {
    document.body.innerHTML = baseHTML();
    window.toast = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([])
    });
  });

  afterEach(() => {
    delete global.DataTransfer;
    jest.useRealTimers();
  });

  describe('toast', () => {
    test('muestra y oculta mensaje', () => {
      jest.useFakeTimers();
      const mod = require('../../src/client/features/admin/index');
      const el = document.getElementById('toast');
      mod.toast('test ok');
      expect(el.textContent).toBe('test ok');
      expect(el.className).toContain('show');
      jest.advanceTimersByTime(2800);
      expect(el.className).toBe('toast');
    });

    test('toast con tipo err', () => {
      const mod = require('../../src/client/features/admin/index');
      mod.toast('error', 'err');
      expect(document.getElementById('toast').className).toContain('err');
    });
  });

  describe('init', () => {
    test('sin modal-auth no hace nada', () => {
      document.body.innerHTML = '<div></div>';
      jest.isolateModules(() => {
        require('../../src/client/features/admin/index');
      });
    });

    test('sin token muestra modal de auth', () => {
      jest.isolateModules(() => {
        const { clearToken: ct } = require('../../src/client/features/admin/state');
        ct();
        require('../../src/client/features/admin/index');
        const authModal = document.getElementById('modal-auth');
        expect(authModal.classList.contains('visible')).toBe(true);
      });
    });

    test('con token oculta modal y carga sidebar', () => {
      jest.isolateModules(() => {
        const { setToken: st } = require('../../src/client/features/admin/state');
        st('valid-token');
        require('../../src/client/features/admin/index');
        expect(document.getElementById('modal-auth').classList.contains('visible')).toBe(false);
      });
    });
  });

  describe('cerrarSesion', () => {
    test('limpia localStorage', () => {
      const mod = require('../../src/client/features/admin/index');
      setToken('test');
      window.cerrarSesion();
      expect(localStorage.getItem('admin_token')).toBeNull();
    });
  });

  describe('drag & drop', () => {
    test('event listeners se agregan al cargar modulo', () => {
      jest.isolateModules(() => {
        const mod = require('../../src/client/features/admin/index');
        const dz = document.getElementById('drop-zone');
        const dragOver = new Event('dragover');
        dz.dispatchEvent(dragOver);
        expect(dz.classList.contains('drag')).toBe(true);
        const dragLeave = new Event('dragleave');
        dz.dispatchEvent(dragLeave);
        expect(dz.classList.contains('drag')).toBe(false);
      });
    });

    test('drop procesa archivo', () => {
      jest.isolateModules(() => {
        const inp = document.getElementById('file-csv');
        Object.defineProperty(inp, 'files', { writable: true, configurable: true, value: [] });
        global.DataTransfer = class {
          constructor() { this.items = { add: jest.fn() }; }
          get files() { return []; }
        };
        const mod = require('../../src/client/features/admin/index');
        const dz = document.getElementById('drop-zone');
        const file = new File(['csv content'], 'test.csv');
        const event = new Event('drop');
        event.preventDefault = jest.fn();
        event.dataTransfer = { files: [file] };
        dz.dispatchEvent(event);
      });
    });
  });

  describe('overlay click', () => {
    test('click en overlay no-auth cierra modal', () => {
      jest.isolateModules(() => {
        require('../../src/client/features/admin/index');
        const overlay = document.getElementById('modal-banco');
        overlay.classList.add('visible');
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(overlay.classList.contains('visible')).toBe(false);
      });
    });

    test('click en overlay auth no cierra', () => {
      jest.isolateModules(() => {
        require('../../src/client/features/admin/index');
        const overlay = document.getElementById('modal-auth');
        overlay.classList.add('visible');
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(overlay.classList.contains('visible')).toBe(true);
      });
    });
  });
});
>>>>>>> origin/main
