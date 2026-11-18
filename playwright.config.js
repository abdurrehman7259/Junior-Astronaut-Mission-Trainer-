import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build served by `next start`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run start -- -p 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: false, // always build fresh; 4174 keeps clear of a manual preview on 4173 (A3 C6)
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } },
  ],
});
