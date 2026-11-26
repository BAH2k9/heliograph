# web: the React frontend

Vite + React 19 + TypeScript + Tailwind v4, talking to `Heliograph.Api` over REST and one SignalR hub.
Repo-wide git/PR rules: `../CLAUDE.md`. Traps: `../.claude/context/GOTCHAS.md`.
Layout, hub, claim, clock and auth notes: `../.claude/context/MODULE_NOTES.md` (paths there are relative to `src/`).

## What's in here (and what isn't)

- In: UI, a hand-written client mirror of the rules, REST and SignalR clients, zustand stores.
- Not here: authority over any rule. The server is the referee.

## Consumers

- Calls `Heliograph.Api`; wire types are hand-mirrored in `src/api/types.ts`.

## Invariants

- `src/game/{rules,board,laser,coords,inferMove}.ts` mirror `Heliograph.Engine` for UX only. When they
  disagree the server wins (`matchesServer` falls back to `identify(serverBoard)` in `src/game/board.ts`).
  A rule change moves the mirror, its `src/game/*.test.ts` and `src/pages/HowToPlayPage.tsx` in the same PR. *(unenforced; `src/game/*.test.ts` cover the mirror only)*
- `src/game/timeControls.ts` and `src/game/gamePresets.ts` are hand-kept copies of the backend registries;
  adding a preset changes both halves in one PR. *(unenforced)*
- One `POST /api/games/{id}/moves` per committed turn; there is no fire-laser endpoint. *(unenforced)*
- The hub only fans out decisions a controller already committed. Never add client logic that needs the hub
  up; a failed connect must leave the REST game playable. *(unenforced)*
- `claimTimeout` / `claimAbandonment` in `src/store.ts` are fire-and-forget; a `409` is benign. *(unenforced)*
- Every `/api/*` call goes through `authFetch`; refresh tokens are single-use, so refreshes share the one
  in-flight promise in `src/api/refreshSession.ts`. *(unenforced)*
- The Vite proxy for the hub uses the object form with `ws: true` in `vite.config.ts`. *(unenforced)*
- Use semantic role tokens from `src/index.css` (`bg-surface`, `text-text-muted`), never raw palette classes. *(unenforced)*

## Commands (scoped to this module)

```
npm run lint    # oxlint
npm run test    # vitest run
npm run build   # tsc -b && vite build
```

`npm run dev` serves `:5173` and proxies `/api/*` (REST + hub WS) to the API on `:5065`.
