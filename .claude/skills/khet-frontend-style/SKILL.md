---
name: khet-frontend-style
description: House React/TypeScript/Tailwind conventions for khet-web's frontend (web/src) — server-is-referee mirroring, the turn model, design tokens, the claim pattern client-side. Use whenever writing or reviewing code under web/src.
user-invocable: false
---

# khet-frontend-style — writing frontend code in this repo

## `web/CLAUDE.md` is the canonical contract — read it first

Don't rely on this file alone; `web/CLAUDE.md` is the source of truth (not restated here,
to avoid the two copies drifting apart) for: the server-is-referee mirror (`game/`), the
turn model, layout (`backend/api/`/`game/`/`store.ts`/`ui/`/`components/`), design tokens, REST-
is-the-source-of-truth / hub-only-fans-out, the claim pattern client-side, the clock's
`serverOffsetMs` recomputation, auth transport (`authFetch` / rotating refresh), and
presets-are-mirrored-catalogs. If any of those needs updating, update `web/CLAUDE.md`
and leave this file pointing at it.

What follows is this skill's *added* value on top of that contract — practical
consequences and "don't"s that extend it rather than restate it.

## Consequences of "the server is the referee"

- Don't add defensive logic elsewhere that assumes the `game/` mirror is always right —
  a mirror bug degrades animation, never correctness, and treating it as authoritative
  anywhere breaks that guarantee.
- Don't "simplify" or refactor `game/` independently of `Heliograph.Engine` — a simplification
  that changes its behavior even slightly is a silent divergence from the real rules. If
  you change a rule in `Heliograph.Engine`, the matching logic in `game/` (and its
  `game/*.test.ts`) moves in the **same PR**.

## `ui/` primitives stay pure

`ui/Button`, `Dialog`, `Field`, `Tabs`, `Panel`, `Badge` (+ `cn`) are the presentational
primitive layer. They must not import a store, call `fetch`, or contain game logic —
that's what keeps `/kitchen-sink` (the dev-only visual index) meaningful as an isolated
preview. If a new primitive needs game or store context, it belongs in `components/`,
not `ui/`.

## Design tokens — the one accepted exception

Use the role tokens (`bg-surface`, `text-text-muted`, `ring-border`, …) per
`web/CLAUDE.md`, never a raw Tailwind color like `slate-800`. Alpha-overlay utilities
like `bg-white/5`, used consistently as hover/tint effects inside the `ui/` primitive
layer itself, are an accepted existing exception — not a pattern to copy elsewhere
without checking first.
