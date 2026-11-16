import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15000,
    projects: [
      { test: { name: 'server', environment: 'node', include: ['tests/server/**/*.test.ts'] } },
      { test: { name: 'web', environment: 'jsdom', include: ['tests/web/**/*.test.{ts,tsx}'] } },
    ],
  },
});
