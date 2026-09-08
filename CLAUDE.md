# khet-web — house style

A web multiplayer rebuild of Khet (laser-chess). `/api` = ASP.NET Core Web API, `/api.tests` =
xUnit, `/web` = React + TypeScript + Tailwind + Vite. Postgres via EF Core, SignalR for realtime.

This file is read automatically by every agent working in this repo (including orchestrator-spawned
backend/frontend agents working from a `plans/*.md` file). It captures conventions already
established by this project's git history so they don't need repeating in every plan.

## Engineering conventions

### Backend projects — which one to open

`Khet.slnx` has three production projects. Start a task in the narrowest one that covers it; each
extracted project has its own `CLAUDE.md`.

| Project | What it is | Tasks that live here |
|---|---|---|
| `Khet.Engine` | Pure laser-chess rules (BCL only). See `Khet.Engine/CLAUDE.md`. | move legality, laser trace, win detection, board layouts, rule variants |
| `Khet.Clock` | Pure clock arithmetic + time-control presets (BCL only). See `Khet.Clock/CLAUDE.md`. | clock formulas, a new time-control preset — **not** clock scheduling/flagging, which is in `Khet.Api` |
| `Khet.Api` | **Fallback — if a task isn't covered by a row above, it's here.** The Web API, EF/Postgres, SignalR, Identity, and all orchestration: `GameService` (split into per-cluster `GameService.*.cs` partials) and its `AddScoped` collaborators — `GameClockLifecycle` (clock *lifecycle* — `InitializeClock` / `UpdateClockAfterMove` / `PreMoveExpiry`), `GameEndService` (the game-ending core + Elo — `FinishGame*` / `ApplyEloAsync`), `GameResponseMapper` (the `GameResponse` wire shape + player profiles); `RoomService` (create/join a room, claim a seat); controllers, hubs, `KhetDbContext`, migrations, `EloService`, and the transactional clock parts (`ClaimTimeoutAsync`, …). | |

`Khet.Engine` and `Khet.Clock` sit at the bottom of the graph (`Khet.Api` → both, never the
reverse) and depend on nothing but the BCL — no `PackageReference`, no `ProjectReference`. Keep them
that way. `EloService` follows the same pure-function discipline but stays in `Khet.Api/Services/`.

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

## No reachable database in your environment? Start your own — don't reach for the home LAN one

Local dev normally points `KHET_TEST_DB` / `dotnet user-secrets`' connection string at a real
Postgres on the owner's home LAN (`192.168.0.20`). **If you're working in a fresh sandbox — and
especially if you're a cloud-run agent — that database is not reachable at all** (it's a private
LAN address, not exposed to the internet) and you should not try. Do not attempt to reach
`192.168.0.20` from an agent environment; if you can't tell whether you're on the home LAN or not,
assume you aren't.

Instead, mirror `.github/workflows/ci.yml` exactly: start your own throwaway `postgres:16`
(Docker if available) with `POSTGRES_USER=khet`, `POSTGRES_PASSWORD=khet`, `POSTGRES_DB=khet_test`
on port 5432, and set `KHET_TEST_DB=Host=127.0.0.1;Port=5432;Database=khet_test;Username=khet;
Password=khet` before running `dotnet test`. That's the same DB the real CI job uses — a PR that
passes against it locally should pass in CI too.

If your environment genuinely can't run any Postgres at all (no Docker, no package manager access):
that's an accepted fallback, not a blocker. The `Integration`-tagged tests already skip gracefully
in that case — don't treat a skip-only test run as a reason to mark the plan `blocked`. Just say so
plainly in the PR body (e.g. "Integration tests skipped — no Postgres reachable in this
environment") so whoever reviews it knows that class of test wasn't actually exercised.

## Working from a `plans/*.md` file

If you were spawned to implement a plan under `plans/`, that file is the spec — read it in full
before writing any code. It pins the exact wire contract (routes, JSON shapes, hub event names) so
you can build against it without waiting on whoever's building the other half. Its "Owner decisions
already made" section closes off product ambiguities already resolved — don't re-litigate them.
For anything else genuinely ambiguous (not an ordinary implementation judgment call): don't guess.
Edit the plan file's frontmatter to `status: blocked` plus a one-line `blocker:` explaining what's
unresolved, stop without opening a PR, and say so clearly in your final report.
