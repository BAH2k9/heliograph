# GOTCHAS — traps and deferred work

Cross-cutting things that will bite you, and things deliberately not built yet. This is the
project's running "watch out for" list, replacing the notes that used to live in an external
Obsidian vault. Module-local invariants stay in the relevant `CLAUDE.md`; this file is for what
spans modules or isn't obvious from the code in front of you.

**Maintaining this file:** cite `file:line` (or a commit) for every entry so it stays checkable.
When a trap is genuinely fixed, delete its entry rather than annotating it — a stale warning costs
more than no warning. Add an entry when you hit something that cost you time and wasn't visible
from the code you were editing. Do not turn this into a backlog of proposed changes.

---

## Traps

### Laser-reflection lookup — do not "fix" a failing frame test by flipping the table
`Khet.Engine.Tests/LaserReflectionFrameTests.cs:43`, cross-referenced from
`BoardLayoutTests.cs:10`. The reflection lookup has a known entry-side subtlety; a failure in these
tests almost always means new code is reading the table wrong, not that the table is wrong.
Flipping the lookup to make the test pass "flips the bug back in" (the test file's own words).

### The client mirrors engine rules — the server is still the only referee
`web/src/game/rules.ts`, `board.ts`, `laser.ts`, `coords.ts`, `inferMove.ts` are a hand-written
copy of `Khet.Engine` used only for highlighting / snap-back / optimistic animation. On any
disagreement the server wins silently (`web/src/game/board.ts:125`, `matchesServer`). A rule change
in `Khet.Engine` must move the mirror (and its `game/*.test.ts`) in the same PR. See
`web/CLAUDE.md`.

### DI lifetime of the game-flow services must stay `Scoped`
`GameService` and its collaborators (`GameEndService`, `GameClockLifecycle`, `GameResponseMapper`,
`RoomService`) share one per-request `KhetDbContext`, and that shared context is what makes
single-transaction atomicity real. A `Singleton` / `Transient`-with-its-own-context
mis-registration breaks atomicity **with every behavioural test still green**. Guarded by
`api.tests/Services/ServiceRegistrationTests.cs`; `api/Program.cs:45-56` and the two service doc
comments say "do not change the lifetime". Believe them.

### An artificial `Task.Delay` must not run against the injected `TimeProvider`
`api/Services/BotService.cs`'s bot "thinking" pause and `api/Services/GameService.SubmitMove.cs`'s
call site use a real wall-clock `Task.Delay(TimeSpan)`, deliberately *not* `Task.Delay(TimeSpan,
TimeProvider)` against the `TimeProvider` `GameService` already takes. `IntegrationFixture` swaps in
a `FakeTimeProvider` that only advances when a test explicitly calls `SetUtcNow` — a delay scheduled
against it would simply never complete, hanging the request forever. `BotService` has its own
test-only override seam (`ThinkingDelayOverrideForTests`, same shape as
`Domain.DiscriminatorAssigner.CandidateOverrideForTests`) for tests that don't want to eat the real
0.5-1.5s wait either.

### One captured `now` per request
Inside `SubmitMoveAsync` every clock decision reads a single `now = Now()` captured up front; a
second `time.GetUtcNow()` / `DateTime.UtcNow` later in the method is a timing-semantics change that
**no test catches** (`api/Services/GameService.SubmitMove.cs`, and `GameClockLifecycle`'s doc
comment). Conversely `RoomService.JoinRoomAsync` deliberately captures `now` *immediately before*
`InitializeClock` rather than hoisting it — hoisting shifts `TurnStartedAtUtc` / `TurnDeadlineUtc`
by the query latency (noted in commit `33494ec`).

### `<see cref>` doc references are not compiler-checked
The API project has no `GenerateDocumentationFile`, so `<see cref="...">` in doc comments can rot
silently — a rename won't break the build. Commit `33494ec` had to repoint two that pointed at
methods which had moved. If you move a method, grep for its name in doc comments.

### A green `dotnet test Khet.slnx` may not have run the integration tests
The `[Trait("Category","Integration")]` tests in `api.tests/Api/` **skip, not fail**, when no
Postgres is reachable (`Skip.If(fixture.UnavailableReason is not null, ...)`). A "all green" run
with those skipped has not exercised the HTTP/EF/SignalR layer at all. Start a throwaway
`postgres:16` and set `KHET_TEST_DB` (see the root `CLAUDE.md` section on this) before trusting a
backend PR locally, and say in the PR body whether they actually ran.

### The service worker must be `no-cache`, or installed PWA clients never see a new deploy
`web/nginx.conf` serves everything outside `/assets/` (which Vite content-hashes) with
`Cache-Control: no-cache`, specifically so `sw.js`/`workbox-*.js` get revalidated every request. If
that header regresses, a browser (or an intermediate cache) can keep serving an old service worker
indefinitely — no error anywhere, the app just silently stops updating for anyone who installed it.
`web/src/components/PwaUpdatePrompt.tsx`'s "new version" toast only ever fires once a client
actually re-fetches `sw.js` and finds it changed.

### iOS PWA storage eviction clearing `localStorage` is expected, not a bug
An installed iOS PWA can have its `localStorage` evicted under storage pressure — this drops
`authStore`'s tokens (`web/src/authStore.ts`), same as any other `localStorage` clear. The app
already tolerates it (falls back to a login prompt via `refreshSession.ts`); if it's ever reported
as "logged out for no reason" on iOS, that's the known tradeoff from `plans/05-pwa.md`, not a fetch
or token-refresh bug.

### `192.168.0.20` "connection refused" after a reboot / network change — check ARP first
Carried over from the old infra notes. Windows once cached a stale ARP entry mapping `.20` (the DB
host on the home LAN) to a device that previously held that DHCP lease, and DBeaver/Npgsql got
refused while Postgres was perfectly healthy. If it recurs, as admin:
`Remove-NetNeighbor -IPAddress 192.168.0.20 -Confirm:$false`. Shouldn't happen under normal use
(the container has a fixed IP and `onboot: 1`), but it's not a code or Postgres fault when it does.
Irrelevant to cloud/sandbox agents, which can't reach that LAN address anyway.

### `user:{id}` SignalR group name is stringly-typed in two files, and `Clients.User()` doesn't work here
`api/Hubs/GameHub.cs` (`SubscribeToUser`) builds `$"user:{userId}"` from the JWT's own `sub` claim;
`api/Controllers/InvitesController.cs` (`Create`) independently builds the same string from
`request.InviteeUserId`. No shared constant ties them together — a typo'd prefix in one file breaks
delivery with no error anywhere (the broadcast just lands on an empty group). Don't reach for
SignalR's built-in `Clients.User(id)` "fix" here either: `Program.cs` sets `MapInboundClaims = false`
and issues `sub`, not the `ClaimTypes.NameIdentifier` SignalR's default `IUserIdProvider` reads, so
`Clients.User()` would silently deliver to nobody. `api.tests/Api/InviteHubIntegrationTests.cs`
covers that the two strings agree today; re-run it after touching either file.

### A bot-game move that stays inside one call bunches both plies' broadcasts together
The first cut of the bot-opponent feature computed the human's move *and* the bot's reply
(including its artificial "thinking" delay) inside one `GameService.SubmitMoveAsync` call, only
broadcasting `moveApplied` for both at the very end. That made the delay invisible — the client's
`submit()` awaited the whole request before releasing its `busy` flag, so even the human's own
hub-pushed move sat queued behind the delay (`applyRemoteMove` in `web/src/store.ts` won't apply a
push while `busy`), and both plies landed as one instant jump the moment the request finally
resolved. Fixed by splitting the bot's reply into its own method
(`GameService.PlayBotReplyIfDueAsync`, `api/Services/GameService.SubmitMove.cs`) that
`GamesController.SubmitMove` (`api/Controllers/GamesController.cs`) calls *after* broadcasting the
human move's own `moveApplied` — plus not holding `busy` across the whole POST in a bot game's
`submit()` (`web/src/store.ts`). If a future change re-bundles per-ply server work into one call
before broadcasting any of it, re-check this exact interaction: broadcast timing on the server and
client-side `busy` gating both have to agree, or multi-step server responses silently collapse on
the client no matter how well-paced the server side looks in isolation.

---

## Deliberately deferred

### Unify all four game endings behind `FinishGameAsync`
Commit `33494ec` states this as a known follow-up carrying "its own behaviour-change budget" —
today the Pharaoh win is still set inline in `SubmitMoveAsync` and calls `ApplyEloAsync` directly,
while timeout / resignation / abandonment route through `FinishGameAsync`. Recorded here because
the commit named it, not as a recommendation to do it now.

### Dev/prod database separation
Discussed in the old infra notes: split into `khet_dev` / `khet_prod` on the one Postgres instance
rather than a second container. Deliberately not done. Revisit before anything resembling real
external deployment.

### `GamesController.ClaimSeat` (`POST /api/games/{id}/claim-seat`) is now dead-ish code
It existed to let someone who was anonymous when they created/joined a room attach their account
after logging in. Guest play is gone (the login-gate change) — every room seat is claimed by an
authenticated caller at creation time now, so the only reachable behavior left is a same-caller
no-op reclaim and rejecting a different account's steal attempt (see
`GameEloIntegrationTests.Claim_seat_requires_auth_a_room_game_and_rejects_someone_elses_seat`).
Left in place deliberately rather than removed in that same change — it's a small, already-tested
capability, and deleting it wasn't that change's job. Candidate for removal (endpoint, `ClaimSeat*`
DTOs, `RoomService.ClaimSeatAsync`) whenever someone's touching that area anyway.

### `plans/` points at a vault path that no longer applies
`plans/README.md` references an Obsidian vault under `...Nextcloud\Bailey\PC data\ObsidianVault\...`
as a source of truth. That vault is being dropped and the path was already wrong. Don't wire
anything new to `plans/*.md` — the directory is disposable process scaffolding slated for deletion
once its backlog is all `done` (per its own README). The lone `plans/…` reference in
`api/Services/GameService.Endings.cs` records an owner decision and can stay as prose.
