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
    env: {
      // Blanked rather than inherited from .env: the suite deals dozens of
      // tables, and it should not need a network or a real database to do it.
      // Drop this line to run the same tests against Redis.
      REDIS_URL: '',
      // Likewise Postgres: with no connection string the build skips its
      // migrations and the app runs without accounts, which is all a quick
      // game needs. Nothing here writes to the database a developer uses.
      DATABASE_URL: '',
      // Built into its own directory. A production build over `.next` swaps the
      // chunks a running dev server is serving, and its open tabs quietly keep
      // showing the code from before.
      NEXT_DIST_DIR: '.next-e2e',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
