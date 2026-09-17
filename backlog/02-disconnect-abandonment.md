---
feature: disconnect-abandonment
status: done
depends_on: []
backend_branch: feat/disconnect-abandonment-be
frontend_branch: feat/disconnect-abandonment-fe
---

# Disconnect / abandonment handling

## Vault context

- `Architecture.md` — describes the current `GameHub`/SignalR shape (group-per-game, REST as the
  source of truth, hub only fans results out) this plan's `GameConnectionTracker` and
  `OnDisconnectedAsync` override build on.
- `Roadmap.md` (Milestone 3 / "Phase 6 — Real-time multiplayer") — the original SignalR + room-code
  design (`Join`/`Leave`, group-per-game) this plan extends with connection tracking.

(Vault root: `C:\Users\baile\Nextcloud\Bailey\PC data\ObsidianVault\Projects\Khet Web\`)

## Why

Nothing detects a vanished opponent today. A *timed* game eventually resolves via
`claim-timeout`, but an **untimed** room game — a real, existing case (`Game.Rated` can be true
while `Game.TimeControl` is null, per `JoinRoomAsync`) — has no mechanism at all to end if one side
simply never comes back. This feature exists mainly for that case, not for timed games (which
already self-resolve).

## Wire contract

- `GameHub.Join(string gameId, string? seat = null)` — signature change: gains an optional `seat`
  (`"P1"`/`"P2"`, omitted/null for a spectator). Existing spectator-style calls that pass only
  `gameId` keep working.
  - **Implementation note (found while building the backend half):** SignalR's hub dispatcher
    checks the wire invocation's argument *count* against the method's declared parameter count
    before binding — a C# default value only helps a direct in-process call, never an
    over-the-wire invocation. A client that sends only one argument gets a hard
    `HubException`/`InvalidDataException` ("Invocation provides 1 argument(s) but target expects
    2"), regardless of `seat`'s default. In practice this means **every** caller — the frontend's
    `realtime.ts` included — must always send both positional arguments, passing an explicit
    `null` for `seat` to join as a spectator; `connection.invoke("Join", gameId)` alone will now
    throw. The existing backend integration tests were updated to always pass both arguments
    (`InvokeAsync("Join", gameId, null)` for a spectator join) for the same reason.
- Server → client broadcasts to the game's group:
  - `opponentDisconnected` — `{ "seat": "P1" | "P2", "disconnectedAtUtc": "<iso>" }` — fired when a
    tracked seat's connection drops while the game is `InProgress`.
  - `opponentReconnected` — `{ "seat": "P1" | "P2" }` — fired when that seat calls `Join` again
    before anyone successfully claims abandonment.
- `POST /api/games/{id}/claim-abandonment` — body `{ "seat": "P1" | "P2" }`, the **caller's own**
  seat ("my opponent abandoned, I win").
  - Server authoritatively checks the *other* seat's tracked disconnect timestamp: it must be set
    and `now - disconnectedAtUtc >= 45` seconds. Never trusts the caller's own say-so — mirrors
    `ClaimTimeoutAsync`'s doc comment almost verbatim.
  - 409 `{ "error": "opponent is not disconnected" }` if no disconnect is tracked for the other
    seat, or `{ "error": "opponent has not been disconnected long enough" }` if tracked but the
    45s window hasn't elapsed. 409 `{ "error": "game is already finished" }` if not `InProgress`.
    404 if no such game.
  - 200 → same shape as resignation/timeout: `GameEndedResponse`-equivalent
    `ClaimAbandonmentResponse(Guid GameId, string Status, string EndReason, DateTime ServerNowUtc)`,
    `EndReason = "Abandonment"`, `Status` = the caller's seat's win. Broadcasts `gameEnded` (same
    event/shape as every other game-ending path).

## Backend scope

- New singleton `GameConnectionTracker` (e.g. `api/Hubs/GameConnectionTracker.cs`):
  `ConcurrentDictionary<string connectionId, (Guid GameId, Player Seat)>`, registered as a DI
  singleton, injected into `GameHub`.
- `GameHub.Join(gameId, seat)`: adds to the SignalR group as today; if `seat` is `"P1"`/`"P2"`,
  records the connection→(game,seat) mapping in the tracker **and** clears that seat's
  `DisconnectedAtUtc` via a `GameService` call (this is the reconnect path — covers both a genuine
  reconnect and an ordinary page refresh, since both look identical to the hub).
- `GameHub.OnDisconnectedAsync(Exception?)` override: look the connection up in the tracker, remove
  it; if found and the game is still `InProgress`, stamp that seat's `DisconnectedAtUtc = now` via
  `GameService` and broadcast `opponentDisconnected` to the group.
- New nullable `Game` columns: `P1DisconnectedAtUtc`, `P2DisconnectedAtUtc` (migration
  `AddDisconnectTracking` — additive columns, same style as `AddTimeControls`, not a new table).
- `GameService.ClaimAbandonmentAsync(Guid id, string seat, CancellationToken ct = default)`: same
  transaction/authoritative-check/`FinishBy...`-tail shape as `ClaimTimeoutAsync` — reuse the same
  win/`FinishedAtUtc`/conditional-Elo tail resignation's plan (`01-resignation.md`) already
  generalized, with `EndReason = "Abandonment"`.
- Applies to **every** game regardless of time control — do not gate on `TimeControl` being
  non-null or non-Daily; untimed games are the actual motivating case.
- **Explicitly do not add a background timer/worker.** This stays pull-based (one client calls
  `claim-abandonment`), consistent with how `claim-timeout` already avoids needing one — see
  `CLAUDE.md`'s "claim pattern" note.
- Accepted simplification, not a bug to fix here: a player with two tabs open on the same seat can
  look "disconnected" if one tab closes while the other stays open — multi-tab-same-seat presence
  tracking is out of scope.

## Frontend scope

- `web/src/realtime.ts`: pass the local seat into the `Join` invocation once known.
- `web/src/store.ts`: handle `opponentDisconnected`/`opponentReconnected` broadcasts (track
  disconnect state + timestamp), plus a `claimAbandonment()` action mirroring `claimTimeout()`.
- A disconnect banner — extend `web/src/components/RoomStatusBar.tsx` or add a small sibling
  component — showing "Opponent disconnected — claimable in Ns", counting down, then a "Claim win"
  button. Auto-fire `claimAbandonment()` at zero exactly like `GameClock.tsx`'s existing
  `claimedDeadline` ref+effect auto-fires `claimTimeout()` — reuse that idiom, don't reinvent it.

## Tests

- Extend `api.tests/Api/GameHubIntegrationTests.cs`: stop a `HubConnection` mid-game and assert the
  tracker/DB update (the relevant `DisconnectedAtUtc` gets set); reconnect (rejoin with the same
  seat) and assert it clears.
- New `api.tests/Api/AbandonmentIntegrationTests.cs`, using the fixture's injectable `TimeProvider`
  the same way `TimeoutEnforcementIntegrationTests.cs` does. Cover: claim before the 45s window
  409s; claim after it succeeds with the right winner/EndReason/Elo; claiming with nothing
  disconnected 409s; claiming on an already-finished game 409s; behavior is consistent across
  untimed, Daily, and live time controls.

## Out of scope

- A server-side timer that auto-forfeits without either client calling `claim-abandonment`.
- Multi-tab-same-seat presence counting.
- Distinguishing "closed the tab" from "lost network" — both just look like a dropped connection to
  `OnDisconnectedAsync`, and that's fine; no need to tell them apart.

## Owner decisions already made

- 45-second grace period is a tunable constant, not a product negotiation — pick this value and
  move on.
- Applies to untimed and Daily games too (those are the ones with no other resolution path today) —
  don't narrow scope to only live-clock games.

## If blocked

Edit this file's frontmatter to `status: blocked` plus a one-line `blocker:` if something genuinely
ambiguous comes up that isn't covered above; stop without opening a PR. Ordinary implementation
judgment calls are yours — don't block on those.
