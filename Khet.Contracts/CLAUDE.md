# Khet.Contracts — the wire/storage contract records

`Khet.Contracts` holds the API's request/response DTOs and the two shapes that are *also* jsonb
columns, extracted from `Khet.Api` into their own assembly so "these depend on nothing" is enforced
by the reference graph instead of by convention. Same pattern as `Khet.Engine` / `Khet.Clock`.

`../GOTCHAS.md` has repo-wide traps; the frontend keeps a hand-written mirror of these records in
`web/src/api/types.ts`, which must move with any change here.

## What's in here — and what isn't

**In here** (~45 `public sealed record` types, seven files):
- `GameApi.cs` — the games / rooms / moves / leaderboard / move-history request+response bodies
  (`GameResponse`, `SubmitMoveRequest`/`SubmitMoveResponse`, `RoomResponse`, the resign/rematch
  request+response pairs, `MoveError`, `GameSummary`, `MoveHistoryResponse`, …).
- `DiagnosticsApi.cs` — the bug-report capture bodies (`BugReportRequest`/`BugReportAck`) and the
  `/api/admin/bug-reports*` admin shapes (`AdminBugReportRow`/`AdminBugReportListResponse`/
  `AdminBugReportDetail`). `BugReportRequest.Bundle`/`AdminBugReportDetail.Bundle` are the one
  deliberate exception to "enum-valued fields are strings" below — they're opaque `JsonElement`,
  never deserialized into a domain type (see `Khet.Api.Domain.BugReport`'s doc comment).
- `BotDifficulty.cs` — `BotDifficulty`/`BotDifficulties`/`UnknownDifficultyException`, the named
  bot-difficulty registry (`Easy`/`Medium`/`Hard`). Same static-registry `For`/`IsKnown` shape as
  `Khet.Engine.RuleSets`/`BoardLayouts`, but lives here rather than `Khet.Engine` because it names a
  `Khet.Api` bot strategy (`BotService.ChooseMove`'s search depth/behavior), not an engine rule.
- `AuthApi.cs` — `RegisterRequest`/`LoginRequest`/`RefreshRequest`, `AuthResponse`, `UserProfile`,
  `PatchMeRequest`, `RatingBucket`, `AuthError`.
- `FriendsApi.cs` — `UserSearchResult`, `FriendRequestCreate`/`FriendRequestCreateResponse`,
  `FriendSummary`, `FriendRequestSummary` — the `/api/users/search` and `/api/friends*` bodies.
- `BoardState.cs` — `CoordDto`, `BoardPiece`, `BoardState`. **`BoardState` is also the shape stored
  in the `Game.State` jsonb column**, not just an API payload — there is deliberately one
  representation.
- `LaserResult.cs` — `LaserResultSegment`, `EmitterInfo`, `EliminatedPiece`, `DamagedPiece`,
  `LaserResult`. **`LaserResult` is also the `Move.LaserResult` jsonb column.**

**Not here:**
- **`BoardMapper`** (engine↔contract translation) stays in `api/Mapping/` — it needs `Khet.Engine`,
  which this project must never reference. `Domain.Game` / `Domain.Move` (the EF entities that carry
  `BoardState` / `LaserResult`) stay in `api/Domain/`.
- The EF jsonb converters/comparers (`JsonbConverter`, `KhetJson`) stay in `api/Persistence/`.

## Consumers

Every controller, every service, `KhetDbContext`, `GameHub`, `BoardMapper`, and the `Domain.Game` /
`Domain.Move` entities (their `State` / `LaserResult` properties). `api.tests` references this
project explicitly.

## Invariants

- **Depends on nothing but the BCL.** `Khet.Contracts.csproj` has zero `PackageReference` and zero
  `ProjectReference`, and a comment at the top says so. If you think you need `Khet.Engine` here to
  "type" a field — you don't; see the next point.
- **Enum-valued fields are strings on purpose.** `BoardPiece.Kind` / `.Owner` / `.Orientation`,
  `LaserResultSegment.Enter` / `.Exit`, etc. are `string` (`"Pyramid"`, `"P1"`, `"NW"`, `"Top"`),
  never `Khet.Engine.Enums` types. That string is the boundary between the engine's domain types and
  the wire/jsonb shape — making it a compiler-enforced boundary is the whole reason this project
  exists. `BoardMapper` in `api/` is the one place the two sides meet.
- **A record's positional property names are simultaneously the HTTP contract and the jsonb
  contract.** Renaming a parameter renames a JSON field the frontend reads *and* changes the shape
  of every already-stored `Game.State` / `Move.LaserResult` row. Treat property renames as a
  breaking change on both axes.
- **One representation shared by wire and storage — on purpose.** `BoardState` / `LaserResult` being
  both the API payload and the jsonb column is a deliberate simplification, not an oversight. It
  makes splitting wire-shape from storage-shape later *harder*; don't "fix" it without a reason.
- **Bottom of the dependency graph.** `Khet.Api` references `Khet.Contracts`, never the reverse.
  Nothing here may reference `Khet.Api.*`, `Khet.Engine` or `Khet.Clock`. Doc-comment references to
  those are written as plain `<c>Fully.Qualified.Name</c>`, not `<see cref>` (same rule as
  `Khet.Engine` / `Khet.Clock` files).

## Public surface

Everything is `public sealed record` and consumed from `Khet.Api`; nothing is `internal`, so there
is no `InternalsVisibleTo` grant. Add one only if a test ever needs an internal.

## Commands (scoped to this module)

```
dotnet build Khet.Contracts/Khet.Contracts.csproj -warnaserror
```

There is no `Khet.Contracts.Tests` project — these records have no behaviour. The one pure class
that operates on them, `BoardMapper`, is tested by `api.tests/Persistence/BoardMapperTests.cs`.
`dotnet test Khet.slnx` still runs everything.
