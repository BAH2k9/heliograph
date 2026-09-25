import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

// The icon set under public/ (pwa-*.png, maskable-icon-512x512.png, apple-touch-icon-180x180.png,
// favicon.ico) is rendered from public/favicon.svg, plus icon-src/maskable.svg for the maskable and
// apple variants the OS crops to its own shape. To regenerate after an icon change, run
// `node icon-src/render-icons.mjs` (it uses a local headless Chrome) and commit the output.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Kept out of the vitest path entirely (not just via devOptions) — the workbox build step
    // and virtual-module resolution have no reason to run under `npm run test`.
    ...(process.env.VITEST ? [] : [VitePWA(pwaOptions)]),
  ],
  server: {
    host: true,
    proxy: {
      // Object form with ws:true — the string shorthand does not proxy the WebSocket
      // upgrade the SignalR hub needs.
      '/api': { target: 'http://localhost:5065', ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Real file standing in for the plugin-generated virtual module (excluded above) so imports
    // of it resolve under vitest — see src/test/pwaRegisterStub.ts.
    alias: {
      'virtual:pwa-register/react': new URL('./src/test/pwaRegisterStub.ts', import.meta.url)
        .pathname,
    },
  },
})
