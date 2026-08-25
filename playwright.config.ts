import { defineConfig } from '@playwright/test';

// E2E гоняет реальное Electron-приложение, поэтому строго последовательно.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: { trace: 'off' },
  reporter: [['list']],
});
