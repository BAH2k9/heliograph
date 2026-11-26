# Heliograph.Contracts: wire and storage records

API request/response DTOs plus `BoardState` and `LaserResult`, which are also jsonb columns. Own assembly so
"depends on nothing" is enforced by the reference graph. File-by-file list: `../../.claude/context/MODULE_NOTES.md`.
Repo-wide traps: `../../.claude/context/GOTCHAS.md`.

## What's in here (and what isn't)

- In: `public sealed record` DTOs and the `BotDifficulty` registry.
- Not here: `BoardMapper` (`backend/api/Mapping/`, needs `Heliograph.Engine`), the EF entities `Game` / `Move`
  (`backend/api/Domain/`), and the jsonb converters (`backend/api/Persistence/`).

## Consumers

- Every controller and service in `Heliograph.Api`, `GameHub`, `HeliographDbContext`, and `api.tests`.
- The frontend hand-mirrors these records in `web/src/api/types.ts`; a change here moves it in the same PR.

## Invariants

- Zero `PackageReference` and zero `ProjectReference`; `Heliograph.Api` references it, never the reverse. *(partly: a reverse reference would be a project cycle; a new `PackageReference` is caught only by the csproj header comment)*
- Enum-valued fields are `string`s (`"Mirror"`, `"P1"`, `"NW"`), never `Heliograph.Engine.Enums` types. *(compiler: no Engine reference)*
- A positional property name is both the HTTP field and the stored jsonb field. A rename breaks the frontend
  and every stored `Game.State` / `Move.LaserResult` row. *(unenforced)*
- `BoardState` and `LaserResult` are deliberately one shape for wire and storage; don't split without a reason. *(unenforced)*
- Doc comments name other projects' types as `<c>Name</c>`, not `<see cref>`. *(unenforced)*
- Everything is `public`; add `InternalsVisibleTo` only if a test needs an internal. *(unenforced)*

## Commands (scoped to this module)

```
dotnet build backend/Heliograph.Contracts/Heliograph.Contracts.csproj -warnaserror
```

No test project of its own; `BoardMapper` is covered by `backend/api.tests/Persistence/BoardMapperTests.cs`.
