import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Integration tests exercise the domain logic against the real local Postgres (no UI). Kept in a
// separate config from the pure unit tests so `npm run test` stays database-free.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/integration/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
