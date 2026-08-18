import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
