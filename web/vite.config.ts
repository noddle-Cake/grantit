import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  // `npm run dev:api` serves the API on 8787; the browser calls /api on the Vite origin, as it will behind nginx.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
