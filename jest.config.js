module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // R3-BLOCKER fix: un test.only accidental NO debe dejar el CI verde.
  // jest 29.7 no soporta forbidOnly (ni CLI ni config — llegó en jest 30);
  // el guard se implementa en setupFilesAfterEnv (corre con el framework
  // instalado) y cubre pnpm test y pnpm test:coverage por igual.
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after-env.js'],

  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/server/**/*.js',
    'src/client/**/*.js',
    '!node_modules/**',
    '!coverage/**',
    '!src/server/config.js',
    '!src/server/startup/banner.js',
    '!src/server/net/picker.js',
    '!src/server/ws/heartbeat.js',
    '!src/client/shared/qrcode.min.js',
    '!src/client/entrypoints/**'
  ],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.kilo/', '<rootDir>/tests/load/'],
  verbose: true
};
