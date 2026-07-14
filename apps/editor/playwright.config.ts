import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: ['**/tests/**/*.spec.ts', '**/e2e/**/*.spec.ts'],
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
});
