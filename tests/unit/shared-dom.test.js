<<<<<<< HEAD
/**
 * @jest-environment jsdom
 */
const { esc } = require('../../src/client/shared/dom.js');

describe('shared/dom', () => {
  test('esc escapa HTML', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('" &')).toBe('&quot; &amp;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
=======
/**
 * @jest-environment jsdom
 */
const { esc } = require('../../src/client/shared/dom.js');

describe('shared/dom', () => {
  test('esc escapa HTML', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('" &')).toBe('&quot; &amp;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
>>>>>>> origin/main
