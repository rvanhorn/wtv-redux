import { defineConfig } from '@playwright/test';
import { readBrowserServerEndpoint } from './scripts/browser-server-endpoint.mjs';

const browserServerEndpoint = readBrowserServerEndpoint();

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/global-setup.js',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    browserName: 'firefox',
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    ...(browserServerEndpoint ? { connectOptions: { wsEndpoint: browserServerEndpoint } } : {}),
  },
  outputDir: 'test-results',
});
