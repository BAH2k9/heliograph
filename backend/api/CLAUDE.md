# Heliograph.Api: Web API, EF/Postgres, SignalR, Identity, orchestration

The fallback project: anything that isn't pure rules (`Heliograph.Engine`), clock math (`Heliograph.Clock`)
or a wire shape (`Heliograph.Contracts`) lives here. It is the only production project allowed project
references, and it depends on all three. What lives where: `../../.claude/context/MODULE_NOTES.md`.
Repo-wide traps: `../../.claude/context/GOTCHAS.md`.

## What's in here (and what isn't)

- In: services, controllers, `GameHub`, `HeliographDbContext` and migrations, `BoardMapper`, `EloService`.
- Not here: rules, clock arithmetic and DTOs, which live in the three BCL-only projects.

## Consumers

- The `web/` frontend over REST and the one SignalR hub. Wire changes also move `web/src/api/types.ts`.

## Invariants

- `GameService` and its collaborators (`GameEndService`, `GameClockLifecycle`, `GameResponseMapper`,
  `RoomService`, `FriendService`, `InviteService`, `AdminService`) stay `AddScoped` in `Program.cs`, sharing
  one per-request `HeliographDbContext`. Any other lifetime breaks atomicity with behaviour tests still green.
  *(`backend/api.tests/Services/ServiceRegistrationTests.cs`)*
- Capture `now` once per request and thread it through every clock decision. The exception is
  `RoomService.JoinRoomAsync`, which captures it immediately before `InitializeClock`. *(unenforced)*
- REST is the source of truth: `GameHub` only broadcasts what a controller decided; never mutate game state
  in a hub method. *(unenforced)*
- No background timers for timeouts or disconnects. Store a timestamp and expose a `claim-*` endpoint that
  re-checks the server clock (see `ClaimTimeoutAsync` in `Services/GameService.Endings.cs`). *(unenforced)*
- Prefer N nullable columns on the existing entity over a child table for a small fixed set of variants. *(unenforced)*
- `null` carries meaning (`Game.TimeControl == null` is untimed); never backfill a default. *(unenforced)*

## Commands (scoped to this project)

```
dotnet build backend/api/Heliograph.Api.csproj -warnaserror
dotnet test  backend/api.tests/Heliograph.Api.Tests.csproj
```

`backend/api.tests/Api/` holds the DB-backed `Integration` tests; they skip with no `HELIOGRAPH_TEST_DB` set.
