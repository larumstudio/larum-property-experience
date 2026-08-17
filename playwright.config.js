'use strict';
/* ── LPE-12 · Playwright configuration ────────────────────────────────
   Two projects: desktop (1280×800) + mobile (390×844, Pixel-class).
   webServer starts the zero-dependency static server so no npm serve
   dependency is required.
   ──────────────────────────────────────────────────────────────────── */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:    './tests/e2e',
  timeout:    30_000,
  retries:    0,
  workers:    1,
  reporter:   [['list']],

  use: {
    baseURL:           'http://localhost:4173',
    actionTimeout:     10_000,
    navigationTimeout: 20_000,
    screenshot:        'only-on-failure',
    video:             'off',
  },

  webServer: {
    command:             'node tests/e2e/static-server.js',
    url:                 'http://localhost:4173',
    reuseExistingServer: true,
    timeout:             15_000,
    stdout:              'pipe',
    stderr:              'pipe',
  },

  projects: [
    {
      name: 'desktop',
      use:  { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use:  {
        ...devices['Pixel 5'],
        viewport:          { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile:          true,
        hasTouch:          true,
      },
    },
  ],
});
