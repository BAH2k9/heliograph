# Heliograph.Api — the Web API, EF/Postgres, SignalR, Identity, orchestration

`Heliograph.Api` is the fallback project (root `CLAUDE.md`'s "which project" table): if a task isn't pure
rules (`Heliograph.Engine`), pure clock math (`Heliograph.Clock`), or a wire/DTO shape (`Heliograph.Contracts`), it's
here. Unlike those three, this project is not BCL-only — it depends on all three, holds every
`ProjectReference`, and is the only production project allowed to.

`../../.claude/context/GOTCHAS.md` has repo-wide traps; a few (the deployed Serilog log retrieval convention, the
`192.168.0.20` home-LAN Postgres) are specific to this project's runtime environment.

## What's in here

- **`GameService`** (`Services/GameService.cs` + `GameService.*.cs` partials — `.SubmitMove`,
  `.Endings`, `.Disconnect`, `.Bot`, `.Diagnostics`) and its `AddScoped` collaborators:
  `GameClockLifecycle` (clock *lifecycle* — `InitializeClock` / `UpdateClockAfterMove` /
  `PreMoveExpiry`; the pure arithmetic it calls into is `Heliograph.Clock`), `GameEndService` (the
  game-ending core + Elo trigger — `FinishGame*` / `ApplyEloAsync`), `GameResponseMapper` (the
  `GameResponse` wire shape + player profiles).
- **`RoomService`** — create/join a room, claim a seat.
- **`BoardMapper`** (`Mapping/BoardMapper.cs`) — the engine↔`Heliograph.Contracts` translation. Stays
  here rather than in `Heliograph.Contracts` because it needs `Heliograph.Engine`.
- **`EloService`** — pure-function rating math, kept to the same no-EF/no-DI discipline as the
  three BCL-only projects even though it lives here (see its own file for why it wasn't extracted).
- **Everything else orchestration-shaped:** `AuthService`, `FriendService`, `InviteService`,
  `AdminService`, `LeaderboardService`, `BotService`; controllers (`Controllers/*.cs`); the one hub
  (`Hubs/GameHub.cs`, `Hubs/GameConnectionTracker.cs`); `HeliographDbContext` + EF migrations; the
  transactional clock endpoints (`ClaimTimeoutAsync` in `GameService.Endings.cs`, and its sibling
  `ClaimAbandonmentAsync`).

## Invariants

- **DI lifetime — never touch this without being certain.** `GameService` and its collaborators
  (`GameEndService`, `GameClockLifecycle`, `GameResponseMapper`, `RoomService`, and by the same
  reasoning `FriendService`, `InviteService`, `AdminService`) are registered `AddScoped` in
  `Program.cs` so they share one per-request `HeliographDbContext` — that shared context is what makes
  single-transaction atomicity real. Registering any of them `Singleton` or
  `Transient`-with-its-own-context breaks atomicity with every behavioral test still green.
  `api.tests/Services/ServiceRegistrationTests.cs` guards this, but know why before changing
  `Program.cs` — don't rely on the test alone to catch it.
- **One captured `now` per request.** Inside a method like `SubmitMoveAsync`, capture `now =
  Now()` (or the injected clock's equivalent) exactly once up front and thread that same value
  through every clock decision in the method. A second independent `DateTime.UtcNow` /
  `TimeProvider.Now` read later is a timing-semantics bug no existing test catches. The one
  exception: `RoomService.JoinRoomAsync` deliberately captures `now` *immediately before*
  `InitializeClock`, not hoisted earlier, because hoisting would shift
  `TurnStartedAtUtc`/`TurnDeadlineUtc` by query latency — know the difference between "one `now`
  per request" and "capture `now` as late as correctness requires" before changing either.
- **REST is the source of truth; the hub only fans results out.** `GameHub` broadcasts what a
  controller action already decided (see `Controllers/GamesController.cs`'s `submit-move` comment)
  — never make a hub method itself mutate game state. If a hub handler needs to change anything,
  that logic belongs in the REST controller/service path, and the hub method calls into the same
  service the controller already calls.
- **"Claim" pattern for anything clock/connection-related.** Don't add a server-side background
  timer/worker to resolve timeouts or disconnects. Instead: track the relevant timestamp on the
  entity, and expose a `claim-*` endpoint that authoritatively re-checks the server's own
  clock/state before resolving — never trust the caller's own say-so that something expired.
  `ClaimTimeoutAsync` (`Services/GameService.Endings.cs`) is the canonical example — its sibling
  `ClaimAbandonmentAsync` follows the same shape for disconnects. See either's doc comment before
  adding a new claim endpoint.
- **Additive columns, not new tables, for a small fixed set of variants.** When something needs N
  parallel values (e.g. per-time-control-category data), prefer N explicit nullable columns on the
  existing entity over a normalized child table — matching `Game.P1RemainingMs`/`P2RemainingMs`
  and the `AddTimeControls` migration's own reasoning. This is a deliberate simplicity trade-off
  for a set of variants that doesn't grow at runtime, not an oversight.
- **Null carries meaning; don't default it away.** E.g. `Game.TimeControl == null` means *untimed*,
  not "pick a default" — see `TimeControl`'s own doc comment. A nullable field being `null` is
  itself a meaningful state; don't backfill a default to make a null check go away, since that
  silently changes behavior for every caller relying on the null case.

## Consumers of the BCL-only projects

`Heliograph.Engine` → `GameEngine.ApplyMove`/`FireLaser`/`CheckWin`/`ValidateMove`/`LegalMoves` (called
from `GameService`/`BotService`), `RuleSets`/`BoardLayouts` (called from `GameService`/
controllers). `Heliograph.Clock` → `ClockMath` (via `GameClockLifecycle`), `TimeControls` (`GameService`,
`RoomService`, plus `ApplicationUser.BucketFor(TimeControlCategory)` making accounts/ratings a
consumer — `EloService`, `AuthService`, `LeaderboardService`). `Heliograph.Contracts` → every controller,
every service, `HeliographDbContext`, `GameHub`, `BoardMapper`, and the `Domain.Game`/`Domain.Move`
entities' `State`/`LaserResult` properties.

## Commands (scoped to this project)

```
dotnet build backend/api/Heliograph.Api.csproj -warnaserror
dotnet test  backend/api.tests/Heliograph.Api.Tests.csproj
```

`api.tests/Api/` holds the `[Trait("Category","Integration")]`, DB-backed tests (skip, not fail,
with no `KHET_TEST_DB` set — see root `CLAUDE.md`'s "Three layers of testing"). `dotnet test
backend/Heliograph.slnx` still runs everything.
