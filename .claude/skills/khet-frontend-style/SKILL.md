---
name: khet-frontend-style
description: House React/TypeScript/Tailwind conventions for khet-web's frontend (web/src) — server-is-referee mirroring, the turn model, design tokens, the claim pattern client-side. Use whenever writing or reviewing code under web/src.
user-invocable: false
---

# khet-frontend-style — writing frontend code in this repo

These are patterns already established by `web/CLAUDE.md` and this codebase's history —
follow them rather than defaulting to generic React idioms that don't match.

## The server is the referee; `game/` only mirrors it

`game/rules.ts`, `game/board.ts`, `game/laser.ts`, `game/coords.ts`, `game/inferMove.ts`
are a hand-written mirror of `Khet.Engine`, used only for legal-move highlighting,
snap-back on an illegal drag, and optimistic slide/rotate/laser animation while the
POST is in flight. They are **never** the authority:

- When the mirror and the server disagree, the server wins silently
  (`matchesServer(computed, serverBoard)` in `game/board.ts` returning false falls back
  to `identify(serverBoard)`). A mirror bug degrades animation, never correctness — so
  don't add defensive logic elsewhere that assumes the mirror is always right.
- If you change a rule in `Khet.Engine`, the matching logic in `game/` must move with it
  in the **same PR**, along with its `game/*.test.ts`. Don't "simplify" or refactor
  `game/` independently of `Khet.Engine` — a simplification that changes its behavior
  even slightly is a silent divergence from the real rules.
- `game/timeControls.ts` and `game/gamePresets.ts` are hand-kept mirrors of fixed,
  non-user-configurable backend registries (`Khet.Clock/TimeControl.cs`, the
  ruleset/layout registries). Adding a preset is a two-repo-half change, same PR.

## The turn model

A turn is one action against a piece: `store.ts` exposes `moveTo`, `rotateSelected`,
`stackTo`, `unstackTo` (stack/unstack are Classic-ruleset only), each submitting a
single `{ type: 'move' | 'rotate' | 'stack' | 'unstack' }`. Firing the laser is implicit
and entirely server-side — there is no "fire laser" endpoint, and there should never be
one. Picking a piece up, previewing, changing your mind: all client-only state, never
sent to the server. Exactly one `POST /api/games/{id}/moves` per committed turn.

## Design tokens — use the role tokens, not raw Tailwind colors

`src/index.css`'s `@theme` defines semantic role tokens: `surface` /
`surface-raised` / `surface-sunken`, `border`, `text` / `text-muted` / `text-subtle`,
`accent`, `danger` / `success` / `warning`, plus board-specific roles (`square`,
`legal`, `select`, …). Use `bg-surface`, `text-text-muted`, `ring-border`, etc. — never
a raw Tailwind color class like `slate-800`. This is what lets a future light theme
override the same token names with zero component churn. (Alpha-overlay utilities like
`bg-white/5` used consistently as hover/tint effects inside the `ui/` primitive layer
itself are an accepted existing exception, not a pattern to copy elsewhere without
checking first.)

Game-specific animation timings (`moveMs`, `deathMs`, laser speed) are a separate,
user-tunable concern in `settings/displaySettings.ts` — don't move them into
`index.css`'s static `--duration-*`/`--ease-*` tokens, which are for non-game UI motion.

## `ui/` primitives stay pure

`ui/Button`, `Dialog`, `Field`, `Tabs`, `Panel`, `Badge` (+ `cn`) are the presentational
primitive layer. They must not import a store, call `fetch`, or contain game logic —
that's what keeps `/kitchen-sink` (the dev-only visual index) meaningful as an isolated
preview. If a new primitive needs game or store context, it belongs in `components/`,
not `ui/`.

## REST is the source of truth; the hub only fans out

`realtime.ts` holds the one SignalR connection. Its inbound events
(`moveApplied`, `gameEnded`, `opponentDisconnected`, `opponentReconnected`) are
broadcasts of decisions a controller already committed — never treat them as
independent state, and never add client logic that only works while the hub connection
is up. A dropped hub connection must leave the REST-driven game fully playable;
`onreconnected` re-`Join`s and triggers a `resync()`.

## The "claim" pattern, client side

`claimTimeout` / `claimAbandonment` in `store.ts` fire the instant a local countdown
hits zero, fire-and-forget. A `409` response is expected and benign (not actually
expired yet, or already resolved by someone else) — don't add error handling that
surfaces a claim's own failure to the user. The authoritative outcome always arrives via
a `gameEnded` push or the next `resync()`, never from the claim call's own response.
`resign()` is the one exception: a deliberate user click, so its failure *does* belong
in the error banner.

## Auth transport

Every `/api/*` call goes through `authFetch`, which attaches the bearer token and
retries once after a `401` refresh. The refresh token is rotating and single-use, so any
new code path that might trigger a 401 (including on mount/boot) must go through
`refreshSession.ts`'s shared in-flight promise rather than calling refresh directly —
two concurrent refreshes race and the loser fails with an already-rotated-away token.

## Tests

A frontend feature ships its `*.test.ts(x)` in the same PR, colocated with its source
(vitest + jsdom + Testing Library). Shared auth fixtures live in
`src/test/authFixtures.ts` — reuse them rather than hand-rolling auth state in a new
test file.
