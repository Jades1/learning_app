import { defineConfig, devices } from '@playwright/test';

// Headless verification for the app. Auto-starts `npm run dev` (or reuses a running one)
// and drives real Chromium against it. Keep tests focused on stable, high-signal behavior;
// avoid flaky canvas-coordinate drag simulation.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
