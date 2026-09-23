import type { VitePWAOptions } from 'vite-plugin-pwa'

// Split out of vite.config.ts so pwa.config.test.ts can assert on these options directly,
// independent of the process.env.VITEST gate that keeps the plugin itself off the vitest path.
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  devOptions: { enabled: false },
  // PwaUpdatePrompt (src/components/PwaUpdatePrompt.tsx) registers the SW itself via
  // useRegisterSW — no auto-injected registration script.
  injectRegister: false,
  includeAssets: ['favicon.svg', 'favicon.ico'],
  manifest: {
    // short_name stays the full name: never shorten it to "Helio" (a trademark clearance condition).
    name: 'Heliograph',
    short_name: 'Heliograph',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    // Matches --color-surface in src/index.css and the <meta name="theme-color"> in
    // index.html — keep all three in sync if the chrome colour ever changes.
    background_color: '#1f242b',
    theme_color: '#1f242b',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      {
        src: 'maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // App shell only — /api/* (REST + the hub's WebSocket upgrade) must never be served from
    // cache. Belt-and-braces: both the denylist below and an explicit NetworkOnly runtime rule.
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
      // No font rule: the display face is self-hosted (@fontsource, imported in main.tsx), so its
      // woff2 files are build output and the globPatterns above precache them.
    ],
  },
}
