# Heliograph.Engine — the pure rules engine

`Heliograph.Engine` is the Heliograph rules engine, extracted from `Heliograph.Api` into its own
assembly so the "it's pure" rule is enforced by the compiler instead of by convention. This file is
the contract for working inside it.

`../../.claude/context/GOTCHAS.md` has repo-wide traps, including two that live here: the laser-reflection lookup's
entry-side subtlety (don't "fix" a failing frame test by flipping the table) and the frontend's
hand-written mirror of this engine in `web/src/game/`, which must move with any rule change here.

## Invariants

- **Pure and deterministic.** No EF, no `DbContext`, no DI / `IServiceProvider`, no `async`, no
  clock, no RNG, no I/O. Every method takes a `Board` (or primitives) and returns a new one —
  nothing mutates in place. The clock arithmetic has the same discipline and its own `Heliograph.Clock`
  project; `EloService` has it too but stays in `Heliograph.Api`.
- **Depends on nothing but the BCL.** `Heliograph.Engine.csproj` has zero `PackageReference` and zero
  `ProjectReference`, and a comment at the top says so. If you think you need to add either, you are
  almost certainly about to break the boundary this project exists to hold — stop and reconsider.
  (`System.Collections.Immutable`, used by `Board`, is part of the net10.0 shared framework, not a
  package.)
- **It is the bottom of the dependency graph.** `Heliograph.Api` references `Heliograph.Engine`, never the
  reverse. Nothing here may reference `Heliograph.Api.Domain` entities (`Game`, `Move`, `ApplicationUser`,
  …), `Heliograph.Api.Data`, the `Heliograph.Contracts` wire records, or anything else outside the BCL.

## Public surface

Default to `internal`. `InternalsVisibleTo` is granted to `Heliograph.Engine.Tests` only — `Heliograph.Api`
cannot see internals, so anything `Heliograph.Api` calls must be `public`. Currently public, and why:

| Type(s) | Why public |
|---|---|
| `Board`, `PieceOnBoard`, `Coord` | `Heliograph.Api`'s `BoardMapper` constructs / reads them directly |
| `Board.Create` | `BoardMapper.ToBoard` builds boards directly; `Heliograph.Api` can't use an `internal` |
| `EngineMove` + `Shift` / `Turn` / `Stack` / `Unstack` | constructed by `BoardMapper.ToEngineMove` |
| `RuleSet`, `RuleSets`, `UnknownRuleSetException` | `RuleSets.For(...)` called in `GameService` / controllers; exception caught by type |
| `BoardLayout` (incl. `.Name`), `BoardLayouts`, `UnknownBoardLayoutException` | same shape as `RuleSet` |
| `PlacedPiece` | element type of the public `BoardLayout.Pieces` — C# accessibility forces it public; no `Heliograph.Api` code reads it today |
| `GameEngine` (`ApplyMove` / `FireLaser` / `CheckWin` / `ValidateMove` / `LegalMoves`), `MoveValidation` | called by `GameService` / `BotService` |
| `LaserOutcome`, `LaserSegment`, `LaserDamage` | read via `BoardMapper.ToLaserResult` |
| the 9 enums in `Heliograph.Engine.Enums` | used across `Heliograph.Api` (`Domain`, `Hubs`, `Mapping`) |
| `LaserReflection` | **internal** — only `GameEngine` and its test use it; keep it that way |

Namespaces follow the folder: files at the project root are `Heliograph.Engine`, files under `Enums/` are
`Heliograph.Engine.Enums`.

## Published as a NuGet package

This project is also the `Heliograph.Engine` package on nuget.org, used by code outside this repo
(bots, tools). So the public surface above is a published API, not only `Heliograph.Api`'s: removing
or renaming a public member, or changing a rule's outcome, needs a new version.

- Release by pushing a tag `engine-v<semver>` (e.g. `engine-v0.2.0`). `.github/workflows/engine-publish.yml`
  tests, packs at that version and pushes with the `NUGET_API_KEY` repo secret. The tag is the version;
  the csproj `<Version>` is only for local packs.
- `README.md` here is the package's readme on nuget.org. Keep its example compiling.
- XML doc comments ship in the package and are checked by the build: a broken `cref` fails `-warnaserror`.

## Commands (scoped to this module)

```
dotnet build backend/Heliograph.Engine/Heliograph.Engine.csproj -warnaserror
dotnet test  backend/Heliograph.Engine.Tests/Heliograph.Engine.Tests.csproj
```

The engine tests are pure unit tests — no Postgres, no fixture. `dotnet test backend/Heliograph.slnx` still runs
everything.
