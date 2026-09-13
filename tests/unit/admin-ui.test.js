<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
const ui = require('../../src/client/features/admin/ui');

describe('admin/ui', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-modal"></div>
      <input id="test-input" type="text">
      <div id="test-display"></div>
      <div id="test-html"></div>
      <div class="togglable"></div>
    `;
  });

  describe('showModal', () => {
    test('agrega visible y limpia display', () => {
      ui.showModal('test-modal');
      expect(document.getElementById('test-modal').classList.contains('visible')).toBe(true);
      expect(document.getElementById('test-modal').style.display).toBe('');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.showModal('no-existe')).not.toThrow();
    });
  });

  describe('hideModal', () => {
    test('remueve visible y setea display none', () => {
      const el = document.getElementById('test-modal');
      el.classList.add('visible');
      ui.hideModal('test-modal');
      expect(el.classList.contains('visible')).toBe(false);
      expect(el.style.display).toBe('none');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.hideModal('no-existe')).not.toThrow();
    });
  });

  describe('setModalContent/setModalValue/getModalValue', () => {
    test('setModalContent setea textContent', () => {
      ui.setModalContent('test-modal', 'hello');
      expect(document.getElementById('test-modal').textContent).toBe('hello');
    });

    test('setModalContent elemento inexistente no falla', () => {
      expect(() => ui.setModalContent('no-existe', 'x')).not.toThrow();
    });

    test('setModalValue setea value', () => {
      ui.setModalValue('test-input', 'new value');
      expect(document.getElementById('test-input').value).toBe('new value');
    });

    test('getModalValue retorna value', () => {
      document.getElementById('test-input').value = 'current';
      expect(ui.getModalValue('test-input')).toBe('current');
    });

    test('getModalValue retorna null si no existe', () => {
      expect(ui.getModalValue('no-existe')).toBeNull();
    });
  });

  describe('setElementDisplay', () => {
    test('setea style.display', () => {
      ui.setElementDisplay('test-display', 'flex');
      expect(document.getElementById('test-display').style.display).toBe('flex');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.setElementDisplay('no-existe', 'none')).not.toThrow();
    });
  });

  describe('setElementHTML', () => {
    test('setea innerHTML', () => {
      ui.setElementHTML('test-html', '<span>ok</span>');
      expect(document.getElementById('test-html').innerHTML).toBe('<span>ok</span>');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.setElementHTML('no-existe', 'x')).not.toThrow();
    });
  });

  describe('toggleClass', () => {
    test('agrega clase si condition es true', () => {
      const el = document.querySelector('.togglable');
      ui.toggleClass(el, 'activo', true);
      expect(el.classList.contains('activo')).toBe(true);
    });

    test('remueve clase si condition es false', () => {
      const el = document.querySelector('.togglable');
      el.classList.add('activo');
      ui.toggleClass(el, 'activo', false);
      expect(el.classList.contains('activo')).toBe(false);
    });

    test('elemento null no falla', () => {
      expect(() => ui.toggleClass(null, 'test', true)).not.toThrow();
    });
  });
});
=======
/**
 * @jest-environment jsdom
 */
const ui = require('../../src/client/features/admin/ui');

describe('admin/ui', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-modal"></div>
      <input id="test-input" type="text">
      <div id="test-display"></div>
      <div id="test-html"></div>
      <div class="togglable"></div>
    `;
  });

  describe('showModal', () => {
    test('agrega visible y limpia display', () => {
      ui.showModal('test-modal');
      expect(document.getElementById('test-modal').classList.contains('visible')).toBe(true);
      expect(document.getElementById('test-modal').style.display).toBe('');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.showModal('no-existe')).not.toThrow();
    });
  });

  describe('hideModal', () => {
    test('remueve visible y setea display none', () => {
      const el = document.getElementById('test-modal');
      el.classList.add('visible');
      ui.hideModal('test-modal');
      expect(el.classList.contains('visible')).toBe(false);
      expect(el.style.display).toBe('none');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.hideModal('no-existe')).not.toThrow();
    });
  });

  describe('setModalContent/setModalValue/getModalValue', () => {
    test('setModalContent setea textContent', () => {
      ui.setModalContent('test-modal', 'hello');
      expect(document.getElementById('test-modal').textContent).toBe('hello');
    });

    test('setModalContent elemento inexistente no falla', () => {
      expect(() => ui.setModalContent('no-existe', 'x')).not.toThrow();
    });

    test('setModalValue setea value', () => {
      ui.setModalValue('test-input', 'new value');
      expect(document.getElementById('test-input').value).toBe('new value');
    });

    test('getModalValue retorna value', () => {
      document.getElementById('test-input').value = 'current';
      expect(ui.getModalValue('test-input')).toBe('current');
    });

    test('getModalValue retorna null si no existe', () => {
      expect(ui.getModalValue('no-existe')).toBeNull();
    });
  });

  describe('setElementDisplay', () => {
    test('setea style.display', () => {
      ui.setElementDisplay('test-display', 'flex');
      expect(document.getElementById('test-display').style.display).toBe('flex');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.setElementDisplay('no-existe', 'none')).not.toThrow();
    });
  });

  describe('setElementHTML', () => {
    test('setea innerHTML', () => {
      ui.setElementHTML('test-html', '<span>ok</span>');
      expect(document.getElementById('test-html').innerHTML).toBe('<span>ok</span>');
    });

    test('elemento inexistente no falla', () => {
      expect(() => ui.setElementHTML('no-existe', 'x')).not.toThrow();
    });
  });

  describe('toggleClass', () => {
    test('agrega clase si condition es true', () => {
      const el = document.querySelector('.togglable');
      ui.toggleClass(el, 'activo', true);
      expect(el.classList.contains('activo')).toBe(true);
    });

    test('remueve clase si condition es false', () => {
      const el = document.querySelector('.togglable');
      el.classList.add('activo');
      ui.toggleClass(el, 'activo', false);
      expect(el.classList.contains('activo')).toBe(false);
    });

    test('elemento null no falla', () => {
      expect(() => ui.toggleClass(null, 'test', true)).not.toThrow();
    });
  });
});
>>>>>>> origin/main
