---
status: needs-owner-check
area: web
reported: 2026-09-18
---
## Report
When a game has begun, the resign button text should change to "End Game" (it currently always
says "Resign", regardless of whether any moves have been played).

## Notes
(none yet)

## Repro steps
Not yet reproduced in a live browser session (no attached Chrome instance in this environment —
`claude-in-chrome`-driven repro is owner-machine-only per the `heliograph-bugfix` skill). Confirmed by
static code reading instead:

1. Start any game (local, bot, or room) — before any move is made, both `ResignButton.tsx` and
   `ActiveGameBanner.tsx` render a button labeled "Resign".
2. Make a move.
3. The button still reads "Resign" — it never becomes "End Game", because neither component reads
   `moveCount` at all.

Intended live repro for whoever picks this up with a browser session: start a local game, confirm
the button reads "Resign" before the first move, make a move, confirm it now reads "End Game" and
still arms/confirms resignation identically.

## Root cause
Both render sites hardcode the unarmed label to the literal `'Resign'` and never consult
`moveCount`:
- `web/src/components/ResignButton.tsx:38` — `{armed ? 'Confirm resign?' : 'Resign'}`
- `web/src/components/ActiveGameBanner.tsx:117` — same pattern

`moveCount: number` already exists on the store (`web/src/store.ts:64`, updated throughout
`store.ts` from server responses) and is the correct signal for "has the game begun"
(`moveCount === 0` ⇒ not begun yet). Neither component currently reads it.

## Fix
In both components: read `moveCount` from `useGame`, and change the unarmed label to
`moveCount > 0 ? 'End Game' : 'Resign'`. The armed/confirm label (`'Confirm resign?'`), all
`canResign` gating, and the underlying `useResignConfirm`/`resign()` flow are unchanged — this is a
label-only change, not a new action.

## Verification
Fixed in `web/src/components/ResignButton.tsx` and `web/src/components/ActiveGameBanner.tsx`: both
now read `moveCount` from `useGame` and render `moveCount > 0 ? 'End Game' : 'Resign'` for the
unarmed label (the armed `'Confirm resign?'` label and all `canResign`/`useResignConfirm` logic are
unchanged).

4 new tests added (2 per component: label is "Resign" at `moveCount: 0`, "End Game" at
`moveCount: 1`) — `web/src/components/ResignButton.test.tsx`,
`web/src/components/ActiveGameBanner.test.tsx`. All three gates green from `/web`:
`npm run lint && npm run test && npm run build` (397 tests passing, was 393).

**Still needs a live session** (why this is `needs-owner-check`, not `verified`): no attached
Chrome instance was available in this environment to actually click through a real game and watch
the label flip after the first move — the `## Repro steps` live-check was not run. The unit tests
prove the label's conditional logic is correct given `moveCount`; they don't prove `moveCount`
itself updates the rendered button in a live game the way the rest of the store already does
elsewhere.
