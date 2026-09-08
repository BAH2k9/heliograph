# web — the React frontend

Vite + React 19 + TypeScript + Tailwind v4 + Framer Motion, talking to `Khet.Api` over REST and
one SignalR hub. The root `../CLAUDE.md` covers repo-wide git/PR conventions; this file is the
frontend's own contract. `../GOTCHAS.md` has the cross-cutting traps — a few live in this folder.

## The one load-bearing idea: the server is the referee, the client only mirrors

`game/rules.ts`, `game/board.ts`, `game/laser.ts`, `game/coords.ts` and `game/inferMove.ts` are a
**hand-written mirror of `Khet.Engine`** (`GameEngine.cs` / `LaserReflection.cs` / the layout
constants). They exist purely for UX — legal-move highlighting, snap-back on an illegal drag,
optimistic slide/rotate/laser animation while the POST is in flight. They are never the authority.

- When the mirror and the server disagree, **the server wins, silently**: `matchesServer(computed,
  serverBoard)` returns false and the caller falls back to `identify(serverBoard)`
  (`game/board.ts:125`). A mirror bug degrades animation, never correctness.
- The `// Keep in sync with …` comments in `game/rules.ts` and `game/timeControls.ts` point at
  **pre-extraction paths** (`api/Engine/GameEngine.cs`, `api/Domain/TimeControl.cs`). The real
  sources are now `Khet.Engine/GameEngine.cs` and `Khet.Clock/TimeControl.cs`. See `../GOTCHAS.md`.
- If you change a rule in `Khet.Engine`, the matching mirror here must move with it in the same PR,
  and its `game/*.test.ts` with it. That's the same "tests in the same PR" rule as the backend.

## Turn model (why the move API looks the way it does)

A turn is one action against a piece — `store.ts` exposes four: `moveTo`, `rotateSelected`,
`stackTo`, `unstackTo`, submitting `{ type: 'move' | 'rotate' | 'stack' | 'unstack' }` (stack /
unstack are Classic-ruleset only). Firing the laser is implicit and entirely server-side. Picking a
piece up, previewing, changing your mind — all client-only, never sent. Exactly one
`POST /api/games/{id}/moves` per committed turn; **there is no "fire laser" endpoint**. That's why
`store.ts`'s `submit()` drives the whole `slide → bullet → destroy → settle` sequence off a single
response payload (`playMoveResult`).

## Layout

| Path | What lives here |
|---|---|
| `api/` | Typed `fetch` wrappers (`client.ts`, `authClient.ts`), wire types (`types.ts`, `authTypes.ts`), and the auth transport (`authFetch.ts`, `refreshSession.ts`). No React. |
| `game/` | The pure engine mirror + board geometry. No React, no `fetch`, no stores — just functions over `ClientBoard` / `Coord`. Fully unit-tested. |
| `store.ts` | The zustand game store — the single source of client game state and every game action. Large and heavily commented; read the interface doc-comments before touching it. |
| `authStore.ts` | zustand + `persist` — tokens and `user`, in `localStorage` under `khet.auth`. |
| `settings/displaySettings.ts` | zustand + `persist` — laser look and animation timings (`khet.displaySettings`). |
| `realtime.ts` | The single SignalR connection. Module-level singleton, not a hook. |
| `components/` · `pages/` · `layout/` | React. `pages/` = route targets (see `App.tsx`), `layout/AppLayout.tsx` = the shell, `components/` = everything else. Flat — no per-folder CLAUDE.md; a typical change touches a component + `store.ts` + `game/` together. |

## REST is the source of truth; the hub only fans out

`realtime.ts` holds one connection to `/api/hub` following the current game. Its four inbound
events — `moveApplied`, `gameEnded`, `opponentDisconnected`, `opponentReconnected` — are
**broadcasts of decisions a controller already committed**, never independent state. A failed hub
connect (or a dropped connection) leaves the REST game fully playable; `onreconnected` re-`Join`s
and triggers a `resync()`. Mirror of the backend `GameHub` doc comment. Don't add client logic
that only works when the hub is up.

`accessTokenFactory` is read live from `authStore` on every (re)connect, so logging in mid-game
reaches the next reconnect. Guest play sends `''` (no token). The Vite proxy must use the object
form with `ws: true` (`vite.config.ts`) — the string shorthand doesn't proxy the hub's WebSocket
upgrade.

## The "claim" pattern, client side

`claimTimeout` / `claimAbandonment` in `store.ts` mirror the backend claim endpoints: fired from a
local countdown tick the instant it hits zero, **fire-and-forget**, and a `409` is expected and
benign (not actually expired yet, or someone else already resolved it). The authoritative outcome
always arrives via a `gameEnded` push or the next `resync()` — never trust the claim call's own
return. `resign()` is the exception: a deliberate user click, so a failure *does* surface in the
error banner.

## Clock

`serverOffsetMs` is recomputed (`serverNowUtc - Date.now()`) from **every** payload that carries
clock fields (`clockFields()` in `store.ts`), so `GameClock`'s local tick reads `Date.now() +
serverOffsetMs` and never accumulates drift against a skewed client clock. The chess clock is
**multiplayer-room-only** — local/solo games (`createGame`) are always untimed and never send a
`timeControl`.

## Auth transport

`authFetch` wraps every `/api/*` call: attaches the bearer token when present, and on a `401`
refreshes once then retries. The refresh token is **rotating and single-use**, so concurrent 401s
and the boot-time `hydrate()` all funnel through `refreshSession.ts`'s shared in-flight promise —
without it, two refreshes race and the loser fails with a rotated-away token. Tokens live in
`localStorage` (XSS tradeoff consciously accepted — see `authStore.ts`'s doc comment).

## Presets are mirrored catalogs, not fetched

`game/timeControls.ts` (↔ `Khet.Clock/TimeControl.cs`) and `game/gamePresets.ts` (↔ the backend
ruleset/layout registries) are hand-kept copies of fixed, non-user-configurable values. Adding a
preset is a two-repo-half change: backend registry + this catalog, same PR.

## Commands / gates

From `/web` (identical to `.github/workflows/ci.yml`):

```
npm run lint    # oxlint
npm run test    # vitest run
npm run build   # tsc -b && vite build
```

`npm run dev` serves `:5173` and proxies `/api/*` (REST + hub WS) to the API on `:5065`.

Tests are `*.test.ts(x)` colocated with their source: vitest + jsdom + Testing Library, bootstrap
in `src/test/setup.ts`, shared auth fixtures in `src/test/authFixtures.ts`. A frontend feature
ships its tests in the **same** PR (repo house style).
