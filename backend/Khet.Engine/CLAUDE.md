# Khet.Engine — the pure rules engine

`Khet.Engine` is the Khet (laser-chess) rules engine, extracted from `Khet.Api` into its own
assembly so the "it's pure" rule is enforced by the compiler instead of by convention. This file is
the contract for working inside it.

`../../.claude/context/GOTCHAS.md` has repo-wide traps, including two that live here: the laser-reflection lookup's
entry-side subtlety (don't "fix" a failing frame test by flipping the table) and the frontend's
hand-written mirror of this engine in `web/src/game/`, which must move with any rule change here.

## Invariants

- **Pure and deterministic.** No EF, no `DbContext`, no DI / `IServiceProvider`, no `async`, no
  clock, no RNG, no I/O. Every method takes a `Board` (or primitives) and returns a new one —
  nothing mutates in place. The clock arithmetic has the same discipline and its own `Khet.Clock`
  project; `EloService` has it too but stays in `Khet.Api`.
- **Depends on nothing but the BCL.** `Khet.Engine.csproj` has zero `PackageReference` and zero
  `ProjectReference`, and a comment at the top says so. If you think you need to add either, you are
  almost certainly about to break the boundary this project exists to hold — stop and reconsider.
  (`System.Collections.Immutable`, used by `Board`, is part of the net10.0 shared framework, not a
  package.)
- **It is the bottom of the dependency graph.** `Khet.Api` references `Khet.Engine`, never the
  reverse. Nothing here may reference `Khet.Api.Domain` entities (`Game`, `Move`, `ApplicationUser`,
  …), `Khet.Api.Data`, the `Khet.Contracts` wire records, or anything else outside the BCL.

## Public surface

Default to `internal`. `InternalsVisibleTo` is granted to `Khet.Engine.Tests` only — `Khet.Api`
cannot see internals, so anything `Khet.Api` calls must be `public`. Currently public, and why:

| Type(s) | Why public |
|---|---|
| `Board`, `PieceOnBoard`, `Coord` | `Khet.Api`'s `BoardMapper` constructs / reads them directly |
| `Board.Create` | `BoardMapper.ToBoard` builds boards directly; `Khet.Api` can't use an `internal` |
| `EngineMove` + `Shift` / `Turn` / `Stack` / `Unstack` | constructed by `BoardMapper.ToEngineMove` |
| `RuleSet`, `RuleSets`, `UnknownRuleSetException` | `RuleSets.For(...)` called in `GameService` / controllers; exception caught by type |
| `BoardLayout` (incl. `.Name`), `BoardLayouts`, `UnknownBoardLayoutException` | same shape as `RuleSet` |
| `PlacedPiece` | element type of the public `BoardLayout.Pieces` — C# accessibility forces it public; no `Khet.Api` code reads it today |
| `GameEngine` (`ApplyMove` / `FireLaser` / `CheckWin` / `ValidateMove` / `LegalMoves`), `MoveValidation` | called by `GameService` / `BotService` |
| `LaserOutcome`, `LaserSegment`, `LaserDamage` | read via `BoardMapper.ToLaserResult` |
| the 9 enums in `Khet.Engine.Enums` | used across `Khet.Api` (`Domain`, `Hubs`, `Mapping`) |
| `LaserReflection` | **internal** — only `GameEngine` and its test use it; keep it that way |

Namespaces follow the folder: files at the project root are `Khet.Engine`, files under `Enums/` are
`Khet.Engine.Enums`.

## Commands (scoped to this module)

```
dotnet build backend/Khet.Engine/Khet.Engine.csproj -warnaserror
dotnet test  backend/Khet.Engine.Tests/Khet.Engine.Tests.csproj
```

The engine tests are pure unit tests — no Postgres, no fixture. `dotnet test backend/Khet.slnx` still runs
everything.
