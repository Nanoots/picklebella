import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { copyFileSync, existsSync } from 'node:fs'

/**
 * maplibre-gl loads its worker as a *second*, separately-fetched ES module
 * (`new Worker(new URL('./maplibre-gl-worker.mjs', import.meta.url))`) — a
 * runtime string Vite's bundler has no way to see, so it never lands in
 * `dist/assets` on its own. Without this, the worker request 404s, and this
 * app's SPA catch-all rewrite (`/:path* -> /index.html`) turns that into a
 * 200 of `text/html`, which the browser refuses to run as a module — the
 * map's background/pin/attribution still render (those don't need the
 * worker), but every tile-dependent layer silently never paints.
 *
 * Copying the file straight from node_modules (rather than committing a
 * static copy) keeps it in lockstep with whatever maplibre-gl version is
 * actually installed — a version mismatch between the main thread and
 * worker code speaks an incompatible internal protocol.
 */
function copyMaplibreWorker(): Plugin {
  return {
    name: 'copy-maplibre-worker',
    apply: 'build',
    closeBundle() {
      const src = path.resolve(import.meta.dirname, 'node_modules/maplibre-gl/dist')
      const dest = path.resolve(import.meta.dirname, 'dist/assets')
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        const from = path.join(src, file)
        if (existsSync(from)) copyFileSync(from, path.join(dest, file))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyMaplibreWorker()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // Vite normally injects a small INLINE module script to polyfill
    // <link rel="modulepreload"> on older browsers. That inline script would
    // require `script-src 'unsafe-inline'` in the CSP, which defeats most of
    // the point of having one. Every browser that supports ES modules well
    // enough to run this app also supports modulepreload, so we drop it and
    // keep `script-src 'self'`.
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 5173,
  },
})
