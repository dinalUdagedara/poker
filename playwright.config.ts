import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against a production build on a port of their own, so
 * they never collide with a dev server someone has open.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The table steps through the bots' moves one at a time so a player can
        // see them. That is motion, so it is skipped under a reduced-motion
        // preference — which also keeps a suite playing dozens of hands quick.
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx next start --port 3210',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
