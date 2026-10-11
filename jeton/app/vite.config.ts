/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const root = import.meta.dirname

/** `/t/<code>` is served by the tiny guest entry (t.html) in dev/preview. In production configure the web server the same way (see README). */
function guestRewrite(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url && /^\/t\/[0-9A-Za-z]+/.test(req.url)) req.url = '/t.html'
    next()
  }
  return { name: 'guest-rewrite', configureServer: (s) => void s.middlewares.use(rewrite), configurePreviewServer: (s) => void s.middlewares.use(rewrite) }
}

const cap = !!process.env.CAP // Capacitor build: relative asset URLs, no guest entry needed

export default defineConfig({
  base: cap ? './' : '/',
  plugins: [react(), guestRewrite()],
  server: { proxy: { '/v1': { target: process.env.API_PROXY ?? 'http://localhost:3000', changeOrigin: true } } },
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(root, 'index.html'), ...(cap ? {} : { guest: resolve(root, 't.html') }) } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
