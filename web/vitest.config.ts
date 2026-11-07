import { defineConfig } from 'vitest/config'
import { alias } from './vite.config.ts'

// Domain rules are tested in shared/; this config is for web-only tests (src/**/*.test.ts).
export default defineConfig({
  resolve: { alias },
  test: { include: ['src/**/*.test.ts'] },
})
