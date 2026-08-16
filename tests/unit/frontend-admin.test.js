/**
 * @jest-environment jsdom
 */
const { escapeHTML } = require('../../src/client/features/admin/api.js');
const { toast } = require('../../src/client/features/admin/index.js');
const { cerrarModal } = require('../../src/client/features/admin/api.js');

describe('admin.js', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <div class="overlay" id="modal-auth" style="display:none">
        <div><input type="password" id="auth-password"><div id="auth-error-box"></div></div>
      </div>
      <div class="toast" id="toast"></div>
      <div id="banco-lista"></div>
      <div id="main-content"></div>
      <div class="overlay" id="modal-banco"></div>
      <div class="overlay" id="modal-pregunta"><input type="radio" name="correcta" value="0"></div>
      <div class="overlay" id="modal-import"></div>
      <select id="mobile-banco-select"></select>
    `;
    const store = {};
    global.localStorage = {
      getItem: jest.fn((k) => store[k] ?? null),
      setItem: jest.fn((k, v) => { store[k] = String(v); }),
      removeItem: jest.fn((k) => { delete store[k]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      get length() { return Object.keys(store).length; },
      key: jest.fn((i) => Object.keys(store)[i] ?? null),
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        status: 200,
      })
    );
  });

  test('escapeHTML escapa caracteres HTML', () => {
    expect(escapeHTML('<script>')).toBe('&lt;script&gt;');
    expect(escapeHTML('" &')).toBe('&quot; &amp;');
    expect(escapeHTML("'")).toBe('&#039;');
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  test('toast muestra mensaje', () => {
    const el = document.getElementById('toast');
    toast('test ok');
    expect(el.textContent).toBe('test ok');
    expect(el.className).toContain('show');
  });

  test('cerrarModal remueve clase visible', () => {
    const m = document.getElementById('modal-banco');
    m.classList.add('visible');
    cerrarModal('modal-banco');
    expect(m.classList.contains('visible')).toBe(false);
  });
});
