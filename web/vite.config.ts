import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

// The icon set under public/ (pwa-*.png, maskable-icon-512x512.png, apple-touch-icon-180x180.png,
// favicon.ico) was generated once from public/favicon.svg via `@vite-pwa/assets-generator`'s
// `minimal2023` preset (maskable/apple variants given the app's dark `--color-surface` (#1f242b)
// as background, since favicon.svg is transparent). The generator isn't a project dependency —
// it pulls in `sharp`'s native binary for a one-off task — so to regenerate after an icon change,
// temporarily `npm i -D @vite-pwa/assets-generator` and rerun its CLI against the SVG, then remove
// the package again once the PNGs are committed.
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
