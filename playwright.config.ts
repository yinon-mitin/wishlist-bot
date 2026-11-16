import { defineConfig } from '@playwright/test';

// PW_CHROMIUM: path to an existing Chromium (handy when `playwright install` is not possible).
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/build.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
});
