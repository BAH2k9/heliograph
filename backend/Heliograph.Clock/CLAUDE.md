# Heliograph.Clock: pure clock arithmetic and time-control presets

Dependency-free half of the server-authoritative clock, in its own assembly so purity is enforced by the
reference graph. Same pattern as `Heliograph.Engine`.
Repo-wide traps: `../../.claude/context/GOTCHAS.md`. Lifecycle vs arithmetic notes: `../../.claude/context/MODULE_NOTES.md`.

## What's in here (and what isn't)

- In: `ClockMath` (`HasExpired`, `AfterMove`, `NextDailyDeadline`) and the `TimeControl` preset registry.
- Not here: the clock lifecycle (starting, banking time, claim-timeout) lives in
  `backend/api/Services/GameClockLifecycle.cs`. A behaviour change usually touches both.

## Consumers

- `Heliograph.Api` (`GameService`, `RoomService`, `EloService`, `AuthService`, `LeaderboardService`).
- The frontend keeps a hand-kept copy of the catalog in `web/src/game/timeControls.ts`; a preset change moves both.

## Invariants

- Pure and deterministic: no EF, DI, `async`, wall-clock read or I/O; every method takes `now`. *(unenforced; tests use literal `DateTime`s)*
- Zero `PackageReference` and zero `ProjectReference`; `Heliograph.Api` references it, never the reverse. *(partly: a reverse reference would be a project cycle; a new `PackageReference` is caught only by the csproj header comment)*
- Doc comments name `Heliograph.Api` / `Engine` / `Contracts` types as `<c>Name</c>`, not `<see cref>`. *(unenforced)*
- Everything is `public`; add `InternalsVisibleTo` only if a test needs an internal. *(unenforced)*

## Commands (scoped to this module)

```
dotnet build backend/Heliograph.Clock/Heliograph.Clock.csproj -warnaserror
dotnet test  backend/Heliograph.Clock.Tests/Heliograph.Clock.Tests.csproj
```
