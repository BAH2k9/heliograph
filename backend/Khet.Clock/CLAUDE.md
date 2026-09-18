# Khet.Clock — the pure clock arithmetic + time-control presets

`Khet.Clock` holds the dependency-free half of the server-authoritative chess clock, extracted from
`Khet.Api` into its own assembly so "it's pure" is enforced by the reference graph instead of by
convention. Same pattern as `Khet.Engine`.

`../../.claude/context/GOTCHAS.md` has repo-wide traps, including the "one captured `now` per request" rule that the
clock lifecycle depends on, and the frontend's hand-kept copy of the `TimeControls` catalog in
`web/src/game/timeControls.ts` (which must move with any preset change here).

## What's in here — and what isn't

**In here:** `ClockMath` (pure arithmetic — `HasExpired`, `AfterMove`, `NextDailyDeadline`) and the
`TimeControl` preset registry (`TimeControl`, `TimeControlCategory`, `TimeControls`,
`TimeControlCategories`, `UnknownTimeControlException`).

**Not here — the clock *lifecycle* lives in `Khet.Api`:** *when* the arithmetic is applied —
starting a clock (`InitializeClock`), banking a mover's time and setting the next deadline
(`UpdateClockAfterMove`), the pre-move expiry check (`PreMoveExpiry`) — is
`backend/api/Services/GameClockLifecycle.cs`, a pure `Game`-field mutator that takes `now` as a parameter
just like this project. The transactional parts — the authoritative `claim-timeout` endpoint
(`ClaimTimeoutAsync` in `backend/api/Services/GameService.Endings.cs`) and ending a game on timeout
(`FinishByTimeoutAsync` in `backend/api/Services/GameEndService.cs`) — are interwoven with EF transactions,
the `Game` entity, Elo, and SignalR broadcasts. This project is only the arithmetic those call
into — a task that changes clock *behaviour* (e.g. "increment applied on the first move", "add a
delay-style time control") will touch `GameClockLifecycle` too, not just this project.

## Consumers

Not only game code. `ApplicationUser.BucketFor(TimeControlCategory)` in
`backend/api/Domain/ApplicationUser.cs` makes accounts/ratings a consumer of `TimeControlCategory` — so
`EloService`, `AuthService`, and `LeaderboardService` reference this project as well as
`GameService` (and its `GameClockLifecycle` / `GameEndService` / `GameResponseMapper` collaborators),
`RoomService`, and `LeaderboardController`.

## Invariants

- **Pure and deterministic.** No EF, no `DbContext`, no DI, no `async`, no wall-clock reads (every
  method takes `now` as a parameter), no I/O. Every method takes exactly the values it needs and
  returns a new value.
- **Depends on nothing but the BCL.** `Khet.Clock.csproj` has zero `PackageReference` and zero
  `ProjectReference`, and a comment at the top says so. If you think you need to add either, you are
  about to break the boundary this project exists to hold — stop and reconsider.
- **Bottom of the dependency graph.** `Khet.Api` references `Khet.Clock`, never the reverse. Nothing
  here may reference `Khet.Api.*` (entities, `Data`, services), `Khet.Contracts`, or `Khet.Engine`.
  Doc-comment references to those are written as plain `<c>Fully.Qualified.Name</c>`, not
  `<see cref>`, precisely because this project can't see them.

## Public surface

Everything is `public` and consumed from `Khet.Api`; nothing is `internal`, so there is no
`InternalsVisibleTo` grant. Add one only if a test ever needs an internal.

## Commands (scoped to this module)

```
dotnet build backend/Khet.Clock/Khet.Clock.csproj -warnaserror
dotnet test  backend/Khet.Clock.Tests/Khet.Clock.Tests.csproj
```

The clock tests are pure unit tests with literal `DateTime`s — no Postgres, no fixture.
`dotnet test backend/Khet.slnx` still runs everything.
