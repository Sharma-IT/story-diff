import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/playwright/**/*.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
});
