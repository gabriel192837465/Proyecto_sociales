const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  // R3-BLOCKER fix: un test.only accidental debe fallar el CI (defensa en
  // config además del flag --forbid-only del workflow).
  forbidOnly: true,
  globalTeardown: './tests/e2e/globalTeardown.js',
  globalSetup: './tests/e2e/globalSetup.js',
  use: {
    baseURL: 'http://127.0.0.1:3002',
    headless: true,
  },
  webServer: {
    command: 'node src/server/index.js',
    port: 3002,
    reuseExistingServer: false,
    env: {
      PORT: '3002',
      HISTORIA_ADMIN_TOKEN: 'historia',
      HEARTBEAT_INTERVAL_MS: '3000',
    },
  },
});
