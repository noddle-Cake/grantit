import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// api/.env (if present) supplies TEST_DATABASE_URL locally; CI sets it directly. Loaded into process.env so the
// global setup sees it as well as the tests. Existing environment variables win.
for (const [k, v] of Object.entries(loadEnv('test', import.meta.dirname, ''))) process.env[k] ??= v

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/test/global-setup.ts'],
    // Database tests share one test database, so files run one at a time.
    fileParallelism: false,
  },
})
