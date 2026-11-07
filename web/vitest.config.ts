import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { alias } from './vite.config.ts'

// Domain rules are tested in shared/; web tests exercise user interactions in a DOM.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], restoreMocks: true },
})
