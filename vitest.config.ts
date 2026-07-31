import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` is a marker the Next bundler reads; outside it the package
      // resolves to an entry that throws on import. Next picks the empty build
      // via the `react-server` condition — pointed at directly here, since the
      // package's exports map hides the file from a plain specifier.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
})
