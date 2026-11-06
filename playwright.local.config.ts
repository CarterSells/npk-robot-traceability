import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/local-browser',
  outputDir: 'test-results/local-browser',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3001', headless: true },
  webServer: { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001', url: 'http://127.0.0.1:3001/local/', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
