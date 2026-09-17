---
feature: bot-opponent
status: done
depends_on: []
backend_branch: feat/bot-opponent-be
frontend_branch: feat/bot-opponent-fe
---

# Bot opponent (play against the computer)

## Why

Every game today needs a second human, live (a room) or on the same device (local/solo pass-and-
play via `POST /api/games`). There's no way to play a full game solo against an opponent that
actually resists you. This adds a bot seat: pick a difficulty, the server plays the other side.

## Research findings this plan is built on

- **No move-enumeration API exists in `Khet.Engine`.** `GameEngine.ValidateMove(Board, EngineMove,
  Player, RuleSet?)` validates one candidate move; there's nothing that lists all legal moves for a
  position. A bot needs this before it needs anything else.
- **No push/trigger mechanism exists after a move commits** — `SubmitMoveAsync`
  (`api/Services/GameService.SubmitMove.cs`) is pure request/response, and the `moveApplied` /
  `gameEnded` SignalR broadcasts happen in `GamesController.SubmitMove`
  (`api/Controllers/GamesController.cs:110-136`), not inside the service. Per this repo's explicit
  no-background-worker convention (`CLAUDE.md`'s claim-pattern section), the bot's move is
  computed **synchronously**, inline in the same request that just applied the human's move —
  never a background poller.
- **No bot-seat concept exists on `Game`.** `P1UserId`/`P2UserId` (`api/Domain/Game.cs:52-58`) are
  `Guid?`, null meaning "anonymous/local seat." Bot games get their own creation path rather than
  overloading the Room/`JoinCode` flow (rooms exist to be joined by a second human over a code;
  a bot never joins that way, and `Rated` — `Game.cs:60-65` — must never flip true for a bot game).
- Clock plumbing (`GameClockLifecycle.PreMoveExpiry`/`UpdateClockAfterMove`) is reused for free
  once the bot's move goes through the same `SubmitMoveAsync` path as a human's.

## Wire contract

**`POST /api/games/bot`** — new endpoint, `GamesController`. Body:
```json
{ "difficulty": "Easy", "ruleset": "Classic", "layout": "Classic", "playerSeat": "P1" }
```
- `difficulty`: `"Easy" | "Medium" | "Hard"`, required. Unknown value → 400
  `{ "error": "..." }`, same shape as `UnknownRuleSetException` today.
- `ruleset`/`layout`: optional, same defaulting/validation as `POST /api/games` today.
- `playerSeat`: optional, `"P1" | "P2"`, defaults to `"P1"` — which seat the human takes (the bot
  takes the other). If the bot is P1, the endpoint immediately plays the bot's opening move before
  returning.
- Response: `GameResponse` (existing shape), **unchanged** except one new field:
  `"botSeat": "P2"` (or `"P1"`/`null` for a non-bot game) so the client knows which seat not to
  let the human move.
- No auth required (matches `POST /api/games`) — bot games are always unrated/anonymous.

**`GET /api/games/{id}`** (existing) — `GameResponse` gains the same `"botSeat"` field for
reconnect/resume.

**`POST /api/games/{id}/moves`** (existing, unchanged request/response shape) — when the human's
move causes `CurrentTurn` to become the bot's seat, the response's move-apply step now also plays
the bot's reply before the HTTP response returns: `SubmitMoveResult.Response` reflects the **bot's**
resulting board (post both plies), and a `moveApplied` SignalR event fires for the bot's move too
(a second broadcast, after the human's), so any other connected client (e.g. a second device
watching) sees both. This means `moveApplied`/`gameEnded` can now fire **twice** per human request
in a bot game — once for the human's move, once for the bot's. The frontend already drops
self-echoes by move number (`web/CLAUDE.md`), so this is compatible with existing hub-consumer
logic without a new event type.

- If the human's move itself ends the game (`gameEnded`), the bot never moves — existing early-out.
- If the bot's own move ends the game, `SubmitMoveResult` reflects `Finished`/game-ended state for
  the bot's move (reuse `GameEndService` exactly as a human ending does).
- Artificial "thinking" delay (~500-1500ms, randomized) is added **only** around the bot's compute
  step, via `Task.Delay` on the request thread — not a background timer, so it doesn't violate the
  claim-pattern convention (it's still one synchronous request/response). In a timed bot game
  (out of scope for v1 — see below — but noted for future-proofing) this delay must be excluded
  from the bot's own clock accounting.

## Owner decisions already made

- Bot occupies a seat on `Game` directly (new nullable `BotSeat`/`BotDifficulty` columns), not a
  Room with a bot-filled seat — confirmed by the user during planning.
- Bot games are created via a **new dedicated endpoint** (`POST /api/games/bot`), not the Room/
  `JoinCode` flow.
- Bot compute runs **server-side**, synchronously inline in the move-submission request path —
  never client-side JS, never a background worker/poller.
- **Three difficulty tiers**: Easy (random legal move, with a basic "don't hang your pharaoh"
  filter if free), Medium (shallow minimax, ~1-2 ply, material + laser-threat eval), Hard (deeper
  alpha-beta, ~3-4 ply, stronger eval). Exact eval weights/depths are an implementation judgment
  call for the backend agent — tune for "feels distinctly harder," not a specific ELO target.
- Bot moves get a small artificial "thinking" delay (~0.5-1.5s) rather than committing instantly.
- **Untimed only for v1.** Bot games never set `TimeControl` (same as today's local/solo games via
  `POST /api/games`) — clock interaction with the bot's thinking delay is explicitly deferred, not
  an oversight. `playerSeat`/timed bot games can be a follow-up plan if wanted later.
- Bot games are always unrated and anonymous (`P1UserId`/`P2UserId` stay null) — no `Rated` flag
  flips, matching how local/solo games behave today.

## Backend scope

1. **`Khet.Engine`: move enumeration.** Add `GameEngine.LegalMoves(Board board, Player toMove,
   RuleSet? ruleSet = null) -> IReadOnlyList<EngineMove>` (or `IEnumerable<EngineMove>` — agent's
   call), built by brute-forcing candidate `EngineMove`s (every own piece × every adjacent `To` +
   every `Turn` rotation, per `EngineMove`'s static factories) through the existing
   `ValidateMove`. Keep it pure/BCL-only per `Khet.Engine/CLAUDE.md`. Add unit tests in
   `api.tests` (or wherever `Khet.Engine`'s existing tests live) asserting it agrees with
   `ValidateMove` on known positions (opening position move count, a position with no legal moves
   if that's reachable, etc).

2. **New `Khet.Api` bot-move service** (e.g. `api/Services/BotService.cs`, `AddScoped`, following
   the existing collaborator pattern alongside `GameClockLifecycle`/`GameEndService`). Public
   surface roughly:
   - `EngineMove ChooseMove(Board board, Player toMove, RuleSet ruleSet, BotDifficulty difficulty)`
     — pure-ish (given a board+difficulty, deterministic module aside from any RNG for Easy/
     tie-breaking), unit-testable without a DB.
   - Easy: pick uniformly at random from `GameEngine.LegalMoves`.
   - Medium/Hard: minimax/alpha-beta over `LegalMoves` + `ApplyMove`/`FireLaser`/`CheckWin`, with a
     hand-written eval (material count, pieces threatened by the opponent's next laser fire,
     pharaoh safety). Depth/weights are the agent's implementation judgment call (see Owner
     decisions).
   - Add unit tests: Easy always returns a legal move; Medium/Hard prefer a move that avoids an
     immediately-losing eval swing over one that doesn't, on a constructed test position.

3. **`Game` domain model** (`api/Domain/Game.cs`): add `BotSeat` (`Player?`, null = not a bot
   game) and `BotDifficulty` (`string?`, one of `"Easy"/"Medium"/"Hard"`, null when `BotSeat` is
   null). EF Core migration for both columns (additive, nullable — matches the "additive columns"
   convention in `CLAUDE.md`).

4. **`GameService`**: new `CreateBotGameAsync(CreateBotGameRequest request, ct)` (new partial file
   `GameService.Bot.cs`, following the existing per-cluster split) — resolves ruleset/layout
   exactly like `CreateAsync`, builds the `Game` with `BotSeat`/`BotDifficulty` set and
   `TimeControl` left null, saves, and — if the bot is `P1` — immediately computes and applies the
   bot's opening move via the same code path `SubmitMoveAsync` uses (factor the "apply one engine
   move to a loaded `Game` and persist" core out of `SubmitMoveAsync` if it isn't already a
   reusable unit) before returning the `GameResponse`.

5. **`GameService.SubmitMoveAsync`**: after committing the human's move and flipping
   `CurrentTurn`, check `game.BotSeat == game.CurrentTurn`. If so, invoke `BotService.ChooseMove`
   for the current board/difficulty, await the artificial delay, then apply the bot's move through
   the same internal apply/persist logic (again, likely a shared private helper) inside the *same*
   transaction/request — producing a second `Move` row, updated `State`, and (if applicable)
   `GameEndService` ending. `SubmitMoveResult` needs a way to carry **both** the human's and the
   bot's outcome back to the controller so it can fire two `moveApplied`/`gameEnded` broadcasts in
   order (extend `SubmitMoveResult`, e.g. an optional second `Response`/`GameEnded` for "the
   follow-up bot move," rather than changing its existing shape for non-bot callers).

6. **`GamesController`**: new `POST /api/games/bot` action calling `GameService.CreateBotGameAsync`
   (same try/catch pattern as `Create` for `UnknownRuleSetException`/`UnknownBoardLayoutException`
   / a new `UnknownDifficultyException` → 400). `SubmitMove` action: after the existing single
   `moveApplied`/`gameEnded` broadcast, if `SubmitMoveResult` carries a bot follow-up, broadcast
   that too, then return the **bot's** resulting response as the HTTP response body (the human's
   own move is still visible to them via the first hub event they'll have already received, or via
   the returned body's move history — agent's call on exact shape, but the client must be able to
   render both plies from one HTTP round trip without a second GET).

7. **`GameResponseMapper`**: include `botSeat`/`botDifficulty` in `GameResponse` (or wherever seat
   metadata already lives in that DTO) so `GET /api/games/{id}` and the create response both carry
   it — needed for reconnect (client must know not to let the human move the bot's pieces after a
   page refresh).

8. **Contracts** (`Khet.Contracts`): new `CreateBotGameRequest` record, `BotDifficulty` (string
   union, following `RuleSets`/`BoardLayouts`/`TimeControls`' static-registry `For`/`IsKnown` shape
   per `CLAUDE.md`'s named-preset convention — add a `BotDifficulties` registry mirroring those).
   Extend `GameResponse` with `BotSeat`/`BotDifficulty`.

## Frontend scope

1. **`web/src/api/`**: add `createBotGame(difficulty, opts)` calling `POST /api/games/bot`; extend
   the `GameResponse` TS type with `botSeat`/`botDifficulty`. (Mirror whatever field names the
   backend agent lands on — coordinate via `SendMessage` per `backlog/README.md` if the wire shape
   drifts from what's pinned above.)

2. **New game entry point**: a difficulty picker (Easy/Medium/Hard) alongside the existing "local
   game" / "create room" entry points on whatever screen currently offers those (check
   `web/src/store.ts`'s `newGame()`/`createRoom()` call sites and their UI). Selecting a difficulty
   calls `createBotGame` and routes into the existing game screen.

3. **Game screen — bot-seat awareness**: `web/src/store.ts` (or wherever move submission is
   gated) must refuse to let the human drag/submit a move for the bot's pieces when
   `botSeat === currentTurn` after the human's own move resolves optimistically, and must
   render **both** plies (human's + bot's) from a single `POST .../moves` response — the response
   now reflects post-bot-move state, so the UI needs a brief "your move → bot's move" transition
   rather than jumping straight to the final board with no indication the bot moved. A "bot is
   thinking…" indicator during the artificial delay is expected UX, not optional polish, given the
   owner's choice of adding the delay specifically for pacing.
   - If reconciling both plies from one response is awkward for the existing move-animation code,
     an acceptable fallback (call it out in the PR if used) is: apply the human's move immediately
     client-side from the request echo, then apply the bot's move a beat later purely from the
     hub's second `moveApplied` broadcast — i.e. treat the HTTP response as authoritative for the
     human's ply only and let SignalR deliver the bot's ply, same as how an opponent's remote move
     already arrives in a room game today.
4. **Reconnect/resume**: `GET /api/games/{id}` now carries `botSeat` — use it to restore the
   move-gating behavior above after a refresh, same as any other resumed game.

## Tests

- `Khet.Engine`: unit tests for `LegalMoves` (opening position count, agreement with
  `ValidateMove`).
- `Khet.Api`: unit tests for `BotService.ChooseMove` at each difficulty (legal-move invariant;
  Medium/Hard prefer the better eval on a constructed position). Integration test (`api.tests/Api/`,
  `[Trait("Category","Integration")]`) creating a bot game with the bot as P1 (asserts an opening
  move already applied) and as P2 (asserts a human move triggers an immediate bot reply, second
  `Move` row present, `CurrentTurn` back to the human).
- `web`: component/store test that a bot-seat game refuses a move on the bot's pieces, and that a
  single move submission results in the board reflecting both plies.

## Out of scope (explicitly deferred, not oversights)

- Timed bot games (clock + thinking-delay interaction).
- Any bot rating/leaderboard presence — bot games are always unrated.
- Bots joining an existing room/multiplayer game as a fill-in for a disconnected human.
- Difficulty tuning beyond "feels distinctly different" — no ELO calibration pass.
- Mobile POC (`mobile/`) support — this plan is `/web` only; the POC can pick this up later if the
  owner wants it there too.

## If blocked

If the exact minimax depth/eval weights, or how to represent "both plies from one HTTP response"
vs. "human ply from HTTP + bot ply from hub" turns out to need a product decision rather than an
implementation judgment call, that's still an implementation judgment call per the framing above —
proceed with a reasonable choice and note it in the PR body rather than blocking. Only mark
`status: blocked` for a genuine ambiguity this file doesn't already resolve (e.g. if `Khet.Engine`
turns out to have a structural reason `LegalMoves` can't be built the way described).
