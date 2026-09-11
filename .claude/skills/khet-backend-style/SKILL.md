---
name: khet-backend-style
description: House C#/ASP.NET Core conventions for khet-web's backend (api/, Khet.Engine, Khet.Clock, Khet.Contracts) — DI lifetimes, the claim pattern, pure-project boundaries, preset registries. Use whenever writing or reviewing C# code in this repo.
user-invocable: false
---

# khet-backend-style — writing C# in this repo

These are patterns already established by this codebase's history (see the per-project
`CLAUDE.md` files for the full rationale) — follow them rather than defaulting to
generic ASP.NET Core idioms that don't match.

## Which project does this belong in

Start in the narrowest project that covers the task (root `CLAUDE.md` has the full
table): `Khet.Engine` for pure rules/laser-trace/win-detection, `Khet.Clock` for pure
clock arithmetic/time-control presets, `Khet.Contracts` for wire/DTO records and the
`BoardState`/`LaserResult` jsonb shapes, `api/` for everything else (EF, SignalR,
Identity, controllers, orchestration services). If you're about to add a
`PackageReference` or `ProjectReference` to `Khet.Engine.csproj`, `Khet.Clock.csproj`, or
`Khet.Contracts.csproj` — stop; those three are BCL-only by design and depending on
anything else breaks the boundary they exist to enforce.

## DI lifetime — never touch this without being certain

`GameService` and its collaborators (`GameEndService`, `GameClockLifecycle`,
`GameResponseMapper`, `RoomService`) are registered `Scoped` so they share one
per-request `KhetDbContext` — that shared context is what makes single-transaction
atomicity real. Registering any of them `Singleton` or `Transient`-with-its-own-context
breaks atomicity with every behavioral test still green (guarded by
`api.tests/Services/ServiceRegistrationTests.cs`, but don't rely on the test to catch
it — know why before changing `api/Program.cs`).

## The "claim" pattern — don't add a background timer

For anything clock- or connection-related that can "expire" (timeout, abandonment,
disconnect), don't add a server-side background worker to resolve it proactively.
Instead: track the relevant timestamp on the entity, and expose a `claim-*` endpoint
that authoritatively re-checks the server's own clock/state before resolving — never
trust the caller's own say-so that something expired. `ClaimTimeoutAsync` is the
canonical example; its doc comment explains why.

## One captured `now` per request

Inside a method like `SubmitMoveAsync`, capture `now = Now()` (or the injected clock's
equivalent) exactly once up front and thread that same value through every clock
decision in the method. A second independent `DateTime.UtcNow` / `TimeProvider.Now`
read later is a timing-semantics bug that no existing test catches. The one exception:
`RoomService.JoinRoomAsync` deliberately captures `now` *immediately before*
`InitializeClock`, not hoisted earlier, because hoisting would shift
`TurnStartedAtUtc`/`TurnDeadlineUtc` by query latency — know the difference between
"one now per request" and "capture now as late as correctness requires" before
changing either.

## Static registry + `For`/`IsKnown` for named presets

`RuleSets`, `BoardLayouts`, `TimeControls` all follow one shape: a small value type, a
static dictionary of named presets, and a `For(name)` that throws a specific
`UnknownXException` (which maps to a 400) on an unrecognized name. Reuse this exact
shape for any new named-preset concept rather than inventing a different pattern (enum,
switch statement, config file, etc.).

## Additive columns over child tables, for small fixed variant sets

When something needs N parallel values for a small, fixed set of variants (e.g.
per-time-control-category data), prefer N explicit nullable columns on the existing
entity over a normalized child table — matching `Game.P1RemainingMs`/`P2RemainingMs`.
This is a deliberate simplicity trade-off for a set of variants that doesn't grow at
runtime, not an oversight.

## Null carries meaning

A nullable field being `null` is itself a meaningful state (e.g. `Game.TimeControl ==
null` means *untimed*, not "pick a default"). Don't backfill a default value to make a
null check go away — that silently changes behavior for every caller relying on the
null case.

## REST is the source of truth; the hub only fans out

`GameHub` broadcasts a decision a controller action already committed. Never put game
state mutation inside a hub method — if a hub handler needs to change anything, that
logic belongs in the REST controller/service path, and the hub method calls into the
same service the controller already calls.

## Public surface discipline in the pure projects

In `Khet.Engine`/`Khet.Clock`/`Khet.Contracts`, default to `internal` and only make
something `public` when `api/` genuinely needs to call it — check the "Public surface"
table in that project's own `CLAUDE.md` before widening visibility, and update the
table when you do. In `Khet.Contracts` specifically, a record's positional property
name is simultaneously the JSON field name *and* the jsonb column shape for already
stored rows — treat a rename as a breaking change on both axes, not a free refactor.

## Doc comments

`<see cref="...">` is not compiler-checked in this project (no
`GenerateDocumentationFile`) — a rename or move silently breaks it. If you rename or
move a method, grep for its old name in doc comments across the solution before moving
on. In the three BCL-only projects, cross-references to anything in `api/` must be
written as plain `<c>Fully.Qualified.Name</c>` text, never `<see cref>`, since those
projects can't see `api/` at all.
