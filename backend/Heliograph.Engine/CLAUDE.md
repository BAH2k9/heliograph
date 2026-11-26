# Heliograph.Engine: the pure rules engine

Rules live in their own assembly so purity is enforced by the project reference graph, not convention.
Also published as the `Heliograph.Engine` NuGet package, so the public surface is a published API.
Repo-wide traps: `../../.claude/context/GOTCHAS.md`. Public-surface table: `../../.claude/context/MODULE_NOTES.md`.

## What's in here (and what isn't)

- In: board, moves, laser trace, win detection, rule sets, board layouts.
- Not here: clock math (`Heliograph.Clock`), wire records (`Heliograph.Contracts`), engine-to-contract
  mapping (`backend/api/Mapping/BoardMapper.cs`).

## Consumers

- `Heliograph.Api` calls `GameEngine`, `RuleSets` and `BoardLayouts`. The frontend keeps a hand-written
  mirror in `web/src/game/`. A rule change moves both in the same PR.

## Invariants

- Pure and deterministic: no EF, DI, `async`, clock, RNG or I/O; nothing mutates in place. *(unenforced; tests are literal-input unit tests)*
- Zero `PackageReference` and zero `ProjectReference`; `Heliograph.Api` references it, never the reverse. *(partly: a reverse reference would be a project cycle; a new `PackageReference` is caught only by the csproj header comment)*
- Default to `internal`; `InternalsVisibleTo` is for `Heliograph.Engine.Tests` only. `LaserReflection` stays internal. *(unenforced)*
- Removing or renaming a public member, or changing a rule's outcome, needs a new package version. *(unenforced)*
- Release by pushing tag `engine-v<semver>`; the tag is the version. Don't rename `engine-publish.yml`: the nuget.org policy names it. *(`.github/workflows/engine-publish.yml`)*
- Keep the example in `README.md` (the nuget.org readme) compiling. *(unenforced)*
- XML doc comments ship in the package; a broken `cref` fails the build. *(`-warnaserror`)*

## Commands (scoped to this module)

```
dotnet build backend/Heliograph.Engine/Heliograph.Engine.csproj -warnaserror
dotnet test  backend/Heliograph.Engine.Tests/Heliograph.Engine.Tests.csproj
```
