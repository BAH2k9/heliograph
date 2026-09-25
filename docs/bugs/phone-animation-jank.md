---
status: needs-owner-check
area: web
reported: 2026-09-25
---
## Report
"just played on my dads phone against a bot and it was super laggy" — then, asked what the lag
looked like: "yh its piece movement and laser fire is like 2 fps".

In-app bug report filed from that phone mid-game: `BugReports.Id = 8a70007e-5c68-4d76-9200-054f5184617c`
(game `196db600-4efd-4cba-a0c1-9601bd48c0b4`, bot game, 24 moves in, received 2026-09-25 16:24:41Z).

## Notes
- Phone model/browser not known (the bundle carries no user agent and the server doesn't log one).
  Worth asking for if this needs another pass.
- The bundle rules out network and server: tap → own `moveApplied` hub push was 81–359ms (median
  ~130ms); the bot's push followed 0.6–1.6s later, which is `BotService.NextThinkingDelay`'s
  deliberate 0.5–1.5s pause plus search time (Hard ≈ 200ms/move, Medium ≈ 50ms on a desktop).
- It also rules out the main thread. `playMoveResult` (`web/src/store.ts`) paces each phase with
  `setTimeout` sleeps, and a queued bot push is drained the instant the human's own animation
  settles — so the gap between the two `applyRemoteMove` ring entries is the real wall-clock length
  of the human move's animation. Predicted from each move's stored laser path
  (`200 + (beamLength + 1) / 12 * 1000` ms, no eliminations): 1283 / 1283 / 1283 / 1283 / 867ms for
  moves 1, 3, 7, 9, 17. Observed on the phone: 1302 / 1300 / 1299 / 1298 / 879ms — within 12–19ms
  every time. A main thread stalled for ~500ms frames would have pushed those timers out by
  hundreds of ms. So at 2 fps the time was going into raster/compositing (painting pixels), not JS.
- One unrelated hiccup in the same bundle: the phone backgrounded at ~176s (WebSocket 1006),
  `resumeFromBackground` resynced, and the human's move 21 (submitted before `reconnected`) never
  got its own `moveApplied` — it was snapped in by the resync instead of animated. Recovered
  correctly; not what was reported, not chased further.
- **Deferred:** `KeepDownEffect.tsx` animates `width`/`height` (layout + paint every frame) for the
  game-ending shockwave. Same class of cost, but it plays once per game, and it wasn't what was
  reported. Left alone.

## Repro steps
Not reproducible on a desktop: a desktop GPU paints both the old laser glow and the old piece
slides at a full 60 fps, so there's nothing to observe there, and there's no CPU/GPU throttling
available to the browser tooling this repo uses. The evidence is the in-app bug report above plus
the timing analysis in `Notes` (pulled read-only from the deployed DB). The real repro is the
original one:
1. On the affected phone, start a bot game (any difficulty).
2. Make a move whose laser crosses most of the board.
3. Watch the piece slide and the laser bullet — reported at ~2 fps.

## Root cause
Per-frame paint cost, in two places:
1. **The laser glow was a live SVG blur.** `LaserLayer.tsx` drew the glow polyline through a
   `<filter><feGaussianBlur>` whose region was set to `COLS+4 × ROWS+4` squares (about twice the
   board's area) so the glow wouldn't clip. The bullet is a stroke-dash whose offset changes every
   frame, so that whole blur was redone every frame at device resolution. Phones that run SVG filters
   on the CPU (WebKit always; Android Chrome whenever GPU raster is off) can't do that at speed.
   Because the laser shared a paint layer with the board, the squares and pieces under the beam
   were repainted with it every frame too.
2. **Pieces slid by main-thread `transform` writes on unpromoted elements.** Framer Motion drives
   `x`/`y`/`rotate` from `requestAnimationFrame`, not as a compositor animation, so without a layer
   of its own each frame's new transform forced a repaint of the board under the moving piece
   instead of just moving an existing GPU texture.

## Fix
Branch `fix/phone-animation-jank` (PR link added once opened):
- `LaserLayer.tsx`: the blur filter is gone. The glow is now two plain, stacked translucent strokes
  (a wider faint halo under the `glowWidth` band). No filter anywhere on the animated beam. This
  is the same technique `LaserPreview.tsx` already used.
- `Board.tsx`: the laser layer gets `will-change: transform`, so the per-frame beam repaint stays
  inside its own layer and doesn't repaint the board and pieces underneath.
- `PieceOnBoard.tsx`: every piece gets `will-change: transform`, so a slide/rotate/death just
  moves or fades an already-painted GPU layer.

## Verification
- `web/src/components/LaserLayer.test.tsx` (new): no `<filter>` element, no `filter` attribute on
  the beam, halo is wider than and underneath the `glowWidth` band. `web/src/components/PieceOnBoard.test.tsx`
  (new): every piece is layer-promoted. These guard the fix from being silently undone; they
  **cannot** prove frame rate. jsdom doesn't paint.
- Frontend gates green (see PR).
- **Not verified on the affected phone.** That's the only place a 2 fps → smooth change can be
  observed, hence `needs-owner-check`: play a bot game on that phone and confirm the slide and the
  laser are smooth. Flip to `verified` (or add what you saw to `Notes`) after that.
