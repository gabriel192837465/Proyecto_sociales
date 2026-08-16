const { expect } = require('@playwright/test');

/**
 * Wait for an alumno page to show a result screen with non-placeholder content.
 * Solves the race where the screen element exists but WS data hasn't rendered yet.
 */
async function waitForAlumnoResult(page, options = {}) {
  const { timeout = 5000 } = options;
  await expect(page.locator('#s-resultado')).toBeVisible({ timeout });
  await expect(page.locator('#res-titulo')).not.toHaveText(/^[-–]$/, { timeout });
}

/**
 * Wait for a timer value to decrease from its current reading.
 * Replaces fragile waitForTimeout + manual comparison.
 */
async function waitForTimerTick(page, options = {}) {
  const { timeout = 5000 } = options;
  const initial = parseInt(await page.locator('#timer-num').textContent());
  await expect(async () => {
    const current = parseInt(await page.locator('#timer-num').textContent());
    expect(current).toBeLessThan(initial);
  }).toPass({ timeout, intervals: [200] });
  return initial;
}

/**
 * Wait for the timer bar width to decrease from its current value.
 */
async function waitForTimerBarShrink(page, options = {}) {
  const { timeout = 5000 } = options;
  const initialWidth = parseFloat(
    await page.locator('#timer-bar').evaluate(el => el.style.width)
  );
  await expect(async () => {
    const currentWidth = parseFloat(
      await page.locator('#timer-bar').evaluate(el => el.style.width)
    );
    expect(currentWidth).toBeLessThan(initialWidth);
  }).toPass({ timeout, intervals: [200] });
  return initialWidth;
}

module.exports = { waitForAlumnoResult, waitForTimerTick, waitForTimerBarShrink };
