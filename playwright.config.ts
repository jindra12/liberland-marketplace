import { defineConfig, devices } from '@playwright/test'

const adminURL = process.env.PLAYWRIGHT_ADMIN_URL ?? 'https://devserver.207-180-231-104.nip.io/admin'

console.log(`[playwright] baseURL=${adminURL}`)

export default defineConfig({
  testDir: './tests/integration',
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  reporter: 'line',
  use: {
    baseURL: adminURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
})
