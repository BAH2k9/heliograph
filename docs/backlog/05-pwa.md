---
feature: pwa
status: done
depends_on: []
frontend_branch: feat/pwa
---

# Installable PWA (no app store)

**Frontend-only plan — orchestrator: spawn the frontend agent only.** There is no backend half,
no `backend_branch`; this ships as one squash-merged PR on `feat/pwa` (CLAUDE.md single-PR form).
No API, DB, SignalR, or contract changes — if you find yourself editing anything under `backend/api/`,
`Khet.*`, or `web/src/api/`, stop and reconsider.

## Vault context

No Obsidian vault notes cover this feature (the external vault this backlog used to reference has
since been dropped). The only
standing project input is the **mobile-web-support requirement**: `/web` must be responsive and
playable on a phone. This plan is the packaging layer on top of that — it makes the already
mobile-friendly site *installable* to the home screen on iOS and Android without going through any
app store.

## Why

The web build is close to playable and the board UI is already touch-friendly (tap-to-select /
tap-to-move on real `<button>`s — `components/Board.tsx:89`, no mouse-drag anywhere), with a
`MobileNav` and `md:`/`sm:` breakpoints already in place. What's missing is the small, well-defined
set of things that turn a responsive site into an installed app:

- a web app manifest + icons so "Add to Home Screen" gives a real icon and a standalone
  (chrome-less) window on both platforms;
- a service worker so the app shell boots instantly (and offline-to-menu), without ever caching
  API/game state;
- an update prompt so an installed client actually picks up new deploys;
- the deploy-time cache headers that make that update path work;
- viewport / safe-area polish so the standalone window isn't clipped by notches / home indicators.

This is deliberately the *whole* mobile story for now. Native wrappers (Capacitor / .NET MAUI) were
considered and rejected: a store-free PWA is the only path that installs on iOS without an Apple
Developer account, and for a turn-based board game the native-API gap is irrelevant. See "Out of
scope".

## Owner decisions already made

- **PWA only — no Capacitor / TWA / native shell in this plan.** If a packaged store build is ever
  wanted, it's a separate future plan that wraps this same web build.
- **`registerType: 'prompt'`, not `autoUpdate`.** A silent SW `autoUpdate` reload can land on a
  player mid-match. `resync()` would recover it, but relying on that is user-hostile — show an
  unobtrusive "New version — reload" affordance and let the user choose. Do not re-litigate this
  into `autoUpdate`.
- **`/api/*` is never cached — NetworkOnly, full stop.** REST is the source of truth and the hub is
  a live WebSocket; the SW must not sit in front of either. Precache the built app shell only.
- **Icons are a fixed asset set generated from the existing mark**, committed to `web/public/` —
  not an upload/runtime concern. `web/public/favicon.svg` is the source of the visual; see
  `components/Logo.tsx` for the current brand mark if a raster needs to be redrawn rather than
  rasterised.
- **No push notifications / background sync in this plan.** iOS PWA push exists (16.4+) but there's
  no product surface that needs it yet. Keep the SW to precache + navigation fallback + update
  flow.

## Frontend scope

All paths under `web/`.

### 1. Manifest + service worker (`vite-plugin-pwa`)

- Add `vite-plugin-pwa` (dev dep) and wire it into `vite.config.ts` alongside the existing
  `react()` / `tailwindcss()` plugins.
- `registerType: 'prompt'`.
- `devOptions: { enabled: false }` — do **not** register a SW in dev; a registration attempt under
  vitest/jsdom noises up `npm run test`. Confirm `npm run test` output is clean of SW/workbox
  warnings after wiring.
- `workbox` config:
  - Precache the build output (JS/CSS/HTML/font/svg/png/woff2 globs) — the app shell only.
  - `navigateFallback: '/index.html'` so a hard-load / installed launch of a client route
    (`/play`, `/replay/:gameId`, `/leaderboard`, …) resolves — mirrors the existing nginx
    `try_files … /index.html` SPA fallback (`web/nginx.conf:8`).
  - `navigateFallbackDenylist: [/^\/api\//]` — the SW must never answer `/api/*` (REST or the
    `/api/hub` WebSocket upgrade) with `index.html`.
  - A single explicit runtime-caching rule for `/api/*` of `NetworkOnly` (belt-and-braces on top
    of the denylist), and no other runtime caching. Google Fonts (`fonts.googleapis.com` /
    `fonts.gstatic.com`, see `index.html:7`) may use a `CacheFirst` rule with an expiration — the
    Cinzel face is otherwise a blank-text flash offline — but that's the only third-party cache.
- `manifest`:
  - `name: "Khet"`, `short_name: "Khet"`, `id: "/"`, `start_url: "/"`, `scope: "/"`.
  - `display: "standalone"`, `orientation: "any"`.
  - `background_color` / `theme_color` — pull the actual values from the app's dark chrome tokens
    in `src/index.css` `@theme` (the `surface` role and whatever the top-bar uses); don't invent
    hex. `theme_color` must match the `<meta name="theme-color">` you add to `index.html`.
  - `icons`: `192x192`, `512x512`, and a `512x512` `"purpose": "maskable"` variant (safe-zone
    padded so Android's mask doesn't clip the mark).
- Register the SW from `src/main.tsx` via the plugin's virtual module. On `onNeedRefresh`, surface
  the update affordance (below). `onOfflineReady` can no-op or fire a one-time toast — your call.

### 2. Update-available affordance

- A small, dismissible UI element (reuse the `ui/` primitives — a `Panel`/`Badge`-styled toast or
  a slim bar; match the muted tournament-minimal chrome, don't add a loud modal) shown when
  `onNeedRefresh` fires. One action: "Reload" → calls the plugin's `updateSW(true)`.
- Must not steal focus or block the board. If it's showing when a move animation is running,
  that's fine — it just sits there until tapped or dismissed.
- Place it at the app shell level (`layout/AppLayout.tsx`) so it's route-independent.

### 3. iOS home-screen specifics (`web/index.html`)

iOS Safari does **not** read the manifest for the home-screen icon or status bar — these must be
tags in `index.html`:

- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` — 180×180, opaque background (iOS
  doesn't respect transparency here), committed to `public/`.
- `<meta name="apple-mobile-web-app-capable" content="yes">` and
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` (or
  `default` — pick whichever renders the dark chrome correctly; verify against the real status
  bar).
- `<meta name="apple-mobile-web-app-title" content="Khet">`.
- `<meta name="theme-color" content="…">` matching the manifest.
- Update the existing `<meta name="viewport">` (`index.html:6`) to
  `width=device-width, initial-scale=1.0, viewport-fit=cover` so the safe-area env vars below
  resolve to real insets.

### 4. Safe-area / standalone viewport polish

- In `src/index.css`, make the app shell honour the notch / home-indicator insets: apply
  `env(safe-area-inset-*)` padding on the outermost shell container(s) — `layout/AppLayout.tsx`
  root and `MobileNav` (`components/MobileNav.tsx:38`) — so the top bar isn't under the notch and
  the bottom of the board isn't under the home indicator in `display: standalone`.
- Audit `min-h-screen` usages (`layout/AppLayout.tsx:94`, `pages/PlayScreen.tsx:95`): on mobile
  Safari `100vh` overflows past the visible area. Switch these to `100dvh` (with a `min-h-screen`
  fallback for older engines) so the play screen fits without a scroll on a phone in the installed
  window.
- Add `touch-action: manipulation` on the board container (`components/Board.tsx:68`) to kill the
  ~300ms tap delay and double-tap-zoom on the board squares. (Full `touch-action: none` is **not**
  needed — there is no drag gesture to protect.)
- Quick real-device pass of the play screen at ~390px width in standalone mode: board, both
  `PlayerCard`s, `RoomStatusBar`, `ResignButton`, rotation overlay all reachable and unclipped.
  Fix layout only where it's actually broken — this plan is packaging, not a mobile redesign.

### 5. Install hint (light touch)

- Android/Chrome: capture `beforeinstallprompt`, stash the event, and show a subtle "Install"
  button (in `MobileNav` overflow or the landing page footer — your call) that calls `prompt()`.
  Hide it once `appinstalled` fires or if the event never arrives.
- iOS: no install API. If `navigator.standalone` is false and the UA is iOS Safari, a one-line
  "Add to Home Screen via the Share menu" hint in the same spot is enough. Keep it dismissible and
  don't nag.
- This is the lowest-priority item — if it turns into a rabbit hole, ship a static "Install"
  help affordance and move on.

### 6. Deploy-time cache headers (`web/nginx.conf`) — do not skip

The static site is served by nginx in the `web` container (`web/Dockerfile`), behind Caddy. The
SW registration script must **not** be cached by the browser/CDN or installed clients never see a
new SW:

- Serve the service-worker script (`sw.js` / whatever `vite-plugin-pwa` emits — check the build
  output name) and `manifest.webmanifest` with `Cache-Control: no-cache`.
- Keep Vite's hashed assets under `/assets/` `immutable` with a long `max-age` (add the
  `location` block if it's not already there).
- Keep the existing `try_files … /index.html` fallback; `index.html` itself should be
  `no-cache` too so a deploy's new asset hashes are picked up.

Verify the built SW filename against `dist/` after a `vite build` and match the `location` exactly.

## Tests

Keep it proportionate — this is mostly config and static assets, so most confidence comes from a
real-device check, not unit tests. In the same PR:

- A `vite build` assertion / smoke test that the manifest and SW are emitted into `dist/` with the
  expected filenames (a small `*.test.ts` that runs `vite build` is heavy; a lighter check is a
  test that imports the resolved vite config and asserts the PWA plugin is present with
  `registerType: 'prompt'` and the `navigateFallbackDenylist` includes `/^\/api\//`). Pick the
  lighter one.
- A unit test for the update-affordance component: given a fake "need refresh" signal it renders
  the reload action, and clicking it calls the injected `updateSW`. Mock the `virtual:pwa-register`
  module in `src/test/setup.ts` (or per-test) so nothing tries to register a real SW under jsdom.
- Confirm `npm run lint && npm run test && npm run build` all pass and the test output has no new
  SW/workbox noise.
- Manual (note the results in the PR body, don't gate CI on them): install on a real iOS device
  and a real Android device; launch from the home screen; play a full local game; trigger a
  redeploy and confirm the update prompt appears and reloading picks up the new build.

## Out of scope

- Any native wrapper — Capacitor, Trusted Web Activity / Bubblewrap APK, .NET MAUI, React Native.
  A store-listed build is a separate future plan.
- Push notifications, background sync, periodic background refresh, badging.
- Offline *gameplay* — the SW caches the app shell so it boots offline, but a game needs the API;
  no offline queue, no local-only match persistence.
- A mobile visual redesign. Fix only layout that's genuinely clipped/broken in the standalone
  window; broader mobile polish is the standing mobile-web workstream, not this plan.
- Backend/API/contract/DB/SignalR changes of any kind.

## Follow-ups to record (not to do here)

- Add a `GOTCHAS.md` entry (with a `file:line` cite) covering: (a) the SW `no-cache` requirement in
  `web/nginx.conf` — get it wrong and deploys silently never reach installed clients; (b) iOS PWA
  storage can be evicted under pressure, which clears `localStorage` — the app already tolerates
  this (auth just falls back to a re-login via `authStore` / `refreshSession.ts`), so if it's ever
  reported it's expected behaviour, not a bug.

## If blocked

Edit this file's frontmatter to `status: blocked` + a one-line `blocker:` only for a genuine
product ambiguity not covered above (e.g. a brand/icon decision the owner must make). Ordinary
implementation judgment — plugin option shapes, where exactly the install button lives, toast vs
bar — is yours. Don't block on those; don't open a PR while blocked.
