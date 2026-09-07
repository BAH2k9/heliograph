# Khet.Clock — the pure clock arithmetic + time-control presets

`Khet.Clock` holds the dependency-free half of the server-authoritative chess clock, extracted from
`Khet.Api` into its own assembly so "it's pure" is enforced by the reference graph instead of by
convention. Same pattern as `Khet.Engine`.

## What's in here — and what isn't

**In here:** `ClockMath` (pure arithmetic — `HasExpired`, `AfterMove`, `NextDailyDeadline`) and the
`TimeControl` preset registry (`TimeControl`, `TimeControlCategory`, `TimeControls`,
`TimeControlCategories`, `UnknownTimeControlException`).

**Not here — the clock *lifecycle* lives in `api/Services/GameService.cs`:** when a clock starts
(`InitializeClock`), banking a mover's remaining time and setting the next deadline
(`UpdateClockAfterMove`), the pre-move expiry check, the authoritative `claim-timeout` endpoint
(`ClaimTimeoutAsync`), and ending a game on timeout (`FinishByTimeoutAsync`). That code is
interwoven with EF transactions, the `Game` entity, `FinishGameAsync`, Elo, and SignalR broadcasts.
This project is only the arithmetic those call into — a task that changes clock *behaviour* (e.g.
"increment applied on the first move", "add a delay-style time control") will touch `GameService`
too, not just this project.

## Consumers

Not only game code. `ApplicationUser.BucketFor(TimeControlCategory)` in
`api/Domain/ApplicationUser.cs` makes accounts/ratings a consumer of `TimeControlCategory` — so
`EloService`, `AuthService`, and `LeaderboardService` reference this project as well as
`GameService` / `RoomsController` / `LeaderboardController`.

## Invariants

- **Pure and deterministic.** No EF, no `DbContext`, no DI, no `async`, no wall-clock reads (every
  method takes `now` as a parameter), no I/O. Every method takes exactly the values it needs and
  returns a new value.
- **Depends on nothing but the BCL.** `Khet.Clock.csproj` has zero `PackageReference` and zero
  `ProjectReference`, and a comment at the top says so. If you think you need to add either, you are
  about to break the boundary this project exists to hold — stop and reconsider.
- **Bottom of the dependency graph.** `Khet.Api` references `Khet.Clock`, never the reverse. Nothing
  here may reference `Khet.Api.*` (entities, `Contracts`, `Data`, services) or `Khet.Engine`.
  Doc-comment references to those are written as plain `<c>Fully.Qualified.Name</c>`, not
  `<see cref>`, precisely because this project can't see them.

## Public surface

Everything is `public` and consumed from `Khet.Api`; nothing is `internal`, so there is no
`InternalsVisibleTo` grant. Add one only if a test ever needs an internal.

## Commands (scoped to this module)

```
dotnet build Khet.Clock/Khet.Clock.csproj -warnaserror
dotnet test  Khet.Clock.Tests/Khet.Clock.Tests.csproj
```

The clock tests are pure unit tests with literal `DateTime`s — no Postgres, no fixture.
`dotnet test Khet.slnx` still runs everything.
