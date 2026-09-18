---
feature: resignation
status: done
depends_on: []
backend_branch: feat/resignation-be
frontend_branch: feat/resignation-fe
---

# Resignation

## Vault context

- `Progress.md` (Phase 4 section, "users, auth & Elo groundwork") — documents the existing
  `EloService`/`ApplyEloAsync`/`Game.Rated` pipeline this plan's win/Elo tail reuses rather than
  duplicating.
- `Roadmap.md` (▶ Phase 4 row) — same groundwork in table form, for the PR/commit history behind
  `ApplyEloAsync`.

(Vault root: `C:\Users\baile\Nextcloud\Bailey\PC data\ObsidianVault\Projects\Khet Web\`)

## Why

`Game.EndReason` today is only ever `"Pharaoh"` (laser kill) or `"Timeout"`. A losing player has no
way to concede — they must either keep playing a dead position or let the clock run out. Every real
online board game treats resigning as a first-class action; this one doesn't have it at all.

## Wire contract

- `POST /api/games/{id}/resign` — body `{ "seat": "P1" | "P2" }`. `seat` is **always required**
  (room game or not) — it's the only way the server knows who is conceding.
  - 400 `{ "error": "spectators cannot resign" }` if `seat` is missing or not `"P1"`/`"P2"`.
  - 409 `{ "error": "game is already finished" }` if the game isn't `InProgress`.
  - 404 if no game has that id.
  - 200 → `ResignResponse(Guid GameId, string Status, string EndReason, DateTime ServerNowUtc)` —
    same shape as the existing `ClaimTimeoutResponse`. `EndReason = "Resignation"`. `Status` is the
    **other** seat's win (`"P1Win"` if `seat` was `"P2"`, and vice versa).
- Hub broadcast: `gameEnded` to the game's SignalR group, payload
  `GameEndedResponse(Status, EndReason, ServerNowUtc)` — the same event name and shape the timeout
  paths already broadcast.

## Backend scope

- `GameService.ResignAsync(Guid id, string seat, CancellationToken ct = default)`:
  - Same transaction shape as `ClaimTimeoutAsync` (`backend/api/Services/GameService.cs`): load the game,
    404 if missing, 409 (throw a `ResignException`, mirroring `ClaimTimeoutException`) if not
    `InProgress`, 400 (throw a `MoveRequestException`-style or dedicated exception) if `seat` isn't
    `"P1"`/`"P2"`.
  - Reuse the win/`FinishedAtUtc`/conditional-Elo tail already factored out for timeouts
    (`FinishByTimeoutAsync`) — either generalize it to take the `EndReason` string as a parameter,
    or add a small sibling that shares the same body shape with `EndReason = "Resignation"` and the
    winner being the *other* seat from the one that resigned. Don't duplicate the Elo-application
    logic — call the same `ApplyEloAsync` path.
- `GamesController` gains a `Resign` action, same shape as `ClaimTimeout`: call the service inside
  the transaction, broadcast `gameEnded` via `hub.Clients.Group(id.ToString())`, map exceptions to
  the status codes above.
- New records in `backend/api/Contracts/GameApi.cs`: `ResignRequest(string Seat)`, `ResignResponse(Guid
  GameId, string Status, string EndReason, DateTime ServerNowUtc)` (fine to alias/reuse
  `ClaimTimeoutResponse` if its shape is already identical — keep the field names above either way).

## Frontend scope

- `web/src/api/client.ts`: `resignGame(gameId: string, seat: 'P1' | 'P2'): Promise<ResignResponse>`.
- `web/src/store.ts`: a `resign()` action following the same pattern as the existing
  `claimTimeout()` — reads the local seat/gameId from state, calls the client, lets the `gameEnded`
  hub broadcast (already wired for timeouts) update the store the same way it does today.
- `web/src/components/RoomStatusBar.tsx`: a "Resign" button next to the existing `Leave` button,
  visible only when seated (`P1`/`P2`, not spectating) and the game is in progress. Needs a confirm
  step — this is irreversible and can affect a rated game's Elo. A two-step inline button ("Resign"
  → "Confirm resign?" on first click, reverting after a few seconds or a click elsewhere) is enough;
  don't build a new modal component for this.
- Extend the existing `endReason === 'Timeout'` special-casing (search for it in
  `web/src/pages/GameArchivePage.tsx` and `web/src/pages/ProfilePage.tsx`'s `statusLabel`-style
  helpers) to also handle `'Resignation'` (e.g. "· by resignation"). Give `web/src/components/
  WinOverlay.tsx`'s winner banner the same qualifier so a resignation win reads differently from a
  Pharaoh-elimination win.

## Tests

New `backend/api.tests/Api/ResignationIntegrationTests.cs`, same `IntegrationFixture`/`Skip.If` pattern as
`backend/api.tests/Api/TimeoutEnforcementIntegrationTests.cs`. Cover:
- Resigning ends the game with the correct winner and `EndReason = "Resignation"`, and the hub group
  receives a `gameEnded` broadcast.
- A missing/invalid seat (spectator) is rejected with the documented 400.
- Resigning an already-finished game 409s.
- Elo updates correctly when the game is `Rated` (assert via the same DB-scope pattern
  `TimeoutEnforcementIntegrationTests` already uses to read both accounts back).

Frontend: a small test for the new store action/client call, following existing patterns in
`web/src/store.test.ts`, plus a `RoomStatusBar.test.tsx` case for the resign button's confirm flow.

## Out of scope

- Draw offers — Khet has no draw/stalemate concept (rotating any piece in place is always a legal
  move), so there's nothing to add here.
- Resigning via the SignalR hub directly — REST stays the single write path for anything that
  changes game state, matching every other move-affecting action in this codebase.

## Owner decisions already made

- Resignation is a plain REST endpoint mirroring `claim-timeout`, not a new hub method — consistent
  with `GameHub`'s own doc comment ("REST stays the source of truth; this hub only broadcasts").

## If blocked

If something here is genuinely ambiguous and not covered above, edit this file's frontmatter to
`status: blocked` and add a one-line `blocker:` explaining what's unresolved. Stop without opening
a PR and say so in your final report. Ordinary implementation judgment calls (e.g. exact exception
type names) are yours to make — don't block on those.
