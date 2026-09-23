---
name: heliograph-backend-style
description: House C#/ASP.NET Core conventions for heliograph-web's backend (backend/api/, Heliograph.Engine, Heliograph.Clock, Heliograph.Contracts) — DI lifetimes, the claim pattern, pure-project boundaries, preset registries. Use whenever writing or reviewing C# code in this repo.
user-invocable: false
---

# heliograph-backend-style — writing C# in this repo

These are patterns already established by this codebase's history (see the per-project
`CLAUDE.md` files for the full rationale) — follow them rather than defaulting to
generic ASP.NET Core idioms that don't match.

## Which project does this belong in

Start in the narrowest project that covers the task (root `CLAUDE.md` has the full
table): `Heliograph.Engine` for pure rules/laser-trace/win-detection, `Heliograph.Clock` for pure
clock arithmetic/time-control presets, `Heliograph.Contracts` for wire/DTO records and the
`BoardState`/`LaserResult` jsonb shapes, `backend/api/` for everything else (EF, SignalR,
Identity, controllers, orchestration services). If you're about to add a
`PackageReference` or `ProjectReference` to `Heliograph.Engine.csproj`, `Heliograph.Clock.csproj`, or
`Heliograph.Contracts.csproj` — stop; those three are BCL-only by design and depending on
anything else breaks the boundary they exist to enforce.

## `backend/api/CLAUDE.md` holds the `Heliograph.Api`-specific invariants

Read it before touching anything under `backend/api/` — it's the canonical source (not restated
here, to avoid the two copies drifting apart) for: the DI lifetime rule (why
`GameService` and its collaborators are `AddScoped`, and what breaks if that changes),
one captured `now` per request, the "claim" pattern (`ClaimTimeoutAsync` /
`ClaimAbandonmentAsync`), REST-is-the-source-of-truth / hub-only-fans-out, additive
columns over child tables, and null-carries-meaning. If any of those needs updating,
update `backend/api/CLAUDE.md` and leave this file pointing at it.

## Static registry + `For`/`IsKnown` for named presets

`RuleSets`, `BoardLayouts`, `TimeControls` all follow one shape: a small value type, a
static dictionary of named presets, and a `For(name)` that throws a specific
`UnknownXException` (which maps to a 400) on an unrecognized name. Reuse this exact
shape for any new named-preset concept rather than inventing a different pattern (enum,
switch statement, config file, etc.).

## Public surface discipline in the pure projects

In `Heliograph.Engine`/`Heliograph.Clock`/`Heliograph.Contracts`, default to `internal` and only make
something `public` when `backend/api/` genuinely needs to call it — check the "Public surface"
table in that project's own `CLAUDE.md` before widening visibility, and update the
table when you do. In `Heliograph.Contracts` specifically, a record's positional property
name is simultaneously the JSON field name *and* the jsonb column shape for already
stored rows — treat a rename as a breaking change on both axes, not a free refactor.

## Doc comments

`<see cref="...">` is not compiler-checked in this project (no
`GenerateDocumentationFile`) — a rename or move silently breaks it. If you rename or
move a method, grep for its old name in doc comments across the solution before moving
on. In the three BCL-only projects, cross-references to anything in `backend/api/` must be
written as plain `<c>Fully.Qualified.Name</c>` text, never `<see cref>`, since those
projects can't see `backend/api/` at all.
