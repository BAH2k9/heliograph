# khet-web — house style

A web multiplayer rebuild of Khet (laser-chess). `/api` = ASP.NET Core Web API, `/api.tests` =
xUnit, `/web` = React + TypeScript + Tailwind + Vite. Postgres via EF Core, SignalR for realtime.

This file is read automatically by every agent working in this repo (including orchestrator-spawned
backend/frontend agents working from a `plans/*.md` file). It captures conventions already
established by this project's git history so they don't need repeating in every plan.

## Engineering conventions

- **The rules engine is pure.** `api/Engine/` has no EF/DI/async — see the README. `ClockMath` and
  `EloService` follow the same discipline (pure functions, no I/O). Don't reach into `KhetDbContext`
  from anything under `Engine/`.
- **REST is the source of truth; the hub only fans results out.** `GameHub` broadcasts what a
  controller action already decided — never make a hub method itself mutate game state. See
  `GameHub`'s own doc comment.
- **"Claim" pattern for anything clock/connection-related.** Don't add a server-side background
  timer/worker to resolve timeouts or disconnects. Instead: track the relevant timestamp, and expose
  a `claim-*` endpoint that authoritatively re-checks the server's own clock/state before resolving
  — never trust the caller's own say-so that something expired. See `ClaimTimeoutAsync`'s doc
  comment for the canonical example.
- **Additive columns, not new tables, for a small fixed set of variants.** When something needs N
  parallel values (e.g. per-time-control-category data), prefer N explicit columns over a
  normalized child table, matching `Game.P1RemainingMs`/`P2RemainingMs` and the `AddTimeControls`
  migration's own reasoning.
- **Static registry + `For`/`IsKnown` for named presets.** `RuleSets`, `BoardLayouts`, `TimeControls`
  all follow the same shape: a small value type, a static dictionary of named presets, a `For(name)`
  that throws a specific `UnknownXException` (→ 400) on a bad name. Reuse this shape for any new
  named-preset concept.
- **Null carries meaning; don't default it away.** E.g. `Game.TimeControl` null means untimed, not
  "pick a default" — see `TimeControl`'s own doc comment. Follow the same discipline for new
  nullable fields.

## Git / PR workflow

- Branch naming: `feat/<slug>` for a single-PR feature; `feat/<slug>-be`/`feat/<slug>-fe` when a
  feature splits into a backend half and a frontend half (further split into `-be1`/`-be2`/... only
  if a backend half itself needs multiple sequential PRs). `fix/` for bug fixes, `chore/` for
  non-feature repo maintenance.
- One squash-merged PR per branch. Tests for a feature are added in the **same** PR as the feature
  — never a follow-up.
- Commit/PR body (single detailed message, since it's squash-merged): a one-line subject
  (`<area>: <what>`, area = `api`/`web`/`engine`/`test`/`ci`/`chore`/`fix`, plus a `BE-n`/`FE-n` tag
  when part of a multi-PR feature), then a bullet per file/concern explaining **why**, not just
  what — call out any deliberately-deferred scope and any product ("owner") decision explicitly.
  Close with the test count/delta and what's newly covered (e.g. "142 tests passing (6 new:
  resignation ends the game, spectator rejected, ...)").
- Before opening a PR: run `dotnet test Khet.slnx` (backend) and `npm run lint && npm run test &&
  npm run build` from `/web` (frontend) — these are the same two gates `.github/workflows/ci.yml`
  runs, so a PR that's green locally should be green in CI.
- Backend-touching PRs' DB-backed tests live in `api.tests/Api/`, tagged
  `[Trait("Category","Integration")]`, using the shared `IntegrationFixture` — they skip (not fail)
  when no Postgres is reachable, via `Skip.If(fixture.UnavailableReason is not null, ...)`.

## Working from a `plans/*.md` file

If you were spawned to implement a plan under `plans/`, that file is the spec — read it in full
before writing any code. It pins the exact wire contract (routes, JSON shapes, hub event names) so
you can build against it without waiting on whoever's building the other half. Its "Owner decisions
already made" section closes off product ambiguities already resolved — don't re-litigate them.
For anything else genuinely ambiguous (not an ordinary implementation judgment call): don't guess.
Edit the plan file's frontmatter to `status: blocked` plus a one-line `blocker:` explaining what's
unresolved, stop without opening a PR, and say so clearly in your final report.
