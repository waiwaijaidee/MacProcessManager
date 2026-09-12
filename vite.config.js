import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The renderer ships with a strict Content-Security-Policy in `index.html`.
 * Vite's dev server injects an inline Fast-Refresh preamble, so the policy is
 * relaxed with `'unsafe-inline'` *for development only* - the production build
 * keeps the original strict policy.
 */
function devCspPlugin() {
  return {
    name: 'mpm-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        "script-src 'self';",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
      )
    }
  }
}

export default defineConfig({
  plugins: [react(), devCspPlugin()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  }
})
