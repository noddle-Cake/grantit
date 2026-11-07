import { defineConfig } from 'vitest/config'
import { alias } from './vite.config.ts'

// Unit tests cover pure domain logic in src/lib; no Cloudflare runtime needed.
export default defineConfig({
  resolve: { alias },
  test: { include: ['src/**/*.test.ts'] },
})
