import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'desktop.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: { trace: 'retain-on-failure' },
})
