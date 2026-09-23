# khet-web — house style

A web multiplayer rebuild of Khet (laser-chess). `/backend/api` = ASP.NET Core Web API,
`/backend/api.tests` = xUnit, `/web` = React + TypeScript + Tailwind + Vite. Postgres via EF Core,
SignalR for realtime. `/infra` holds the deployment stack (`docker-compose.yml`, `Caddyfile`,
`deploy.sh`).

This file is read automatically by every agent working in this repo (including orchestrator-spawned
backend/frontend agents working from a `docs/backlog/*.md` file). It captures conventions already
established by this project's git history so they don't need repeating in every plan.

- **`.claude/context/ARCHITECTURE.md` is the whole-system map — read it first if you're new to this
  codebase or need the mental model before a non-trivial change.** It's a from-scratch guided tour
  (game rules → the 5 ideas that explain almost everything → data model → "where to make a change"
  table), distinct from the per-module *contracts* below: read it once to understand how the system
  fits together, then come back to the relevant `CLAUDE.md` when you're actually changing something.
- **`/web` has its own `web/CLAUDE.md`** — the frontend's contract (server-is-referee, the turn
  model, the SignalR/REST split, auth transport). Read it for any `/web` task.
- **`.claude/context/GOTCHAS.md` is the running "watch out for" list** — cross-module traps that
  aren't visible from the code in front of you, plus deliberately-deferred work. Skim it before a
  non-trivial change; add to it (with a `file:line` cite) when something costs you time. (Prose
  citations elsewhere in the repo just say "`GOTCHAS.md`" without the full path — that's fine, this
  bullet is the one place the actual location needs to be exact.)
- **`docs/bugs/*.md` is the bug queue** — a durable, agent-readable hand-off for an in-progress bug
  report, distinct from `docs/backlog/*.md`'s prescoped feature work (see below). Use the
  `khet-bugfix` skill to file, work, or close one.
- **Security/infra audit for the "get khet on the web" push** lives outside the repo, in the vault:
  `C:\Users\baile\Nextcloud\Bailey\PC data\ObsidianVault\Home Server\Tracking\2026-09-11 Proxmox
  Autonomous Session Report.md` (Proxmox-wide, not khet-web-only — backups, AppArmor, firewall,
  Tailscale ACLs, CT-level findings). Check `Tracking\INDEX.md` in that same folder for current
  status per item rather than re-reading the whole report — each finding is broken out into its own
  tracked item there (open/blocked/done), the same durable-hand-off shape as this repo's
  `docs/bugs/*.md` but for infra instead of code. To file a new item, update one, or ingest a new audit report into
  that folder, follow `Tracking\.claude\skills\homelab-tracking\SKILL.md` directly (it isn't
  auto-discovered from this repo — read it as a file, don't look for an equivalent skill here). Only
  relevant when continuing that security-hardening work — skip it otherwise.

## Engineering conventions

### Backend projects — which one to open

`Heliograph.slnx` has four production projects. Start a task in the narrowest one that covers it; each
extracted project has its own `CLAUDE.md`.

| Project | What it is | Tasks that live here |
|---|---|---|
| `Heliograph.Engine` | Pure laser-chess rules (BCL only). See `backend/Heliograph.Engine/CLAUDE.md`. | move legality, laser trace, win detection, board layouts, rule variants |
| `Heliograph.Clock` | Pure clock arithmetic + time-control presets (BCL only). See `backend/Heliograph.Clock/CLAUDE.md`. | clock formulas, a new time-control preset — **not** clock scheduling/flagging, which is in `Heliograph.Api` |
| `Heliograph.Contracts` | Wire/DTO records + the shared board/laser jsonb shapes (BCL only). See `backend/Heliograph.Contracts/CLAUDE.md`. | adding or changing an API request/response field; the `BoardState` / `LaserResult` shape (which is also the `Game.State` / `Move.LaserResult` column) |
| `Heliograph.Api` | **Fallback — if a task isn't covered by a row above, it's here.** The Web API, EF/Postgres, SignalR, Identity, and all orchestration. See `backend/api/CLAUDE.md` for what lives here and its own invariants (DI lifetimes, the claim pattern, REST-vs-hub, additive columns, null-carries-meaning). | |

`Heliograph.Engine`, `Heliograph.Clock` and `Heliograph.Contracts` sit at the bottom of the graph (`Heliograph.Api` → all
three, never the reverse) and depend on nothing but the BCL — no `PackageReference`, no
`ProjectReference`. Keep them that way. `EloService` follows the same pure-function discipline but
stays in `Heliograph.Api/Services/`.

- **Static registry + `For`/`IsKnown` for named presets.** `RuleSets`, `BoardLayouts`, `TimeControls`
  all follow the same shape: a small value type, a static dictionary of named presets, a `For(name)`
  that throws a specific `UnknownXException` (→ 400) on a bad name. Reuse this shape for any new
  named-preset concept, whichever project it belongs in.

## Git / PR workflow

- **Standing authorization to open PRs without asking first.** Once a task's work is
  substantially complete and the pre-PR gates in this section pass, push the branch and
  open the PR immediately — don't stop to ask "should I open a PR for this?" first. This
  repo's owner has pre-authorized that step in advance via this file, so treat it as
  routine rather than something to confirm each time. This covers pushing a `feat/`,
  `fix/`, or `chore/` branch (never `main`) and running `gh pr create`; it does **not**
  extend to force-pushing, merging, or anything else in the "risky actions" category —
  those still need an explicit ask. If review turns up changes, push more commits to the
  same branch/PR rather than opening a second one.
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
- Before opening a PR: run `dotnet test backend/Heliograph.slnx` (backend) and `npm run lint && npm run
  test && npm run build` from `/web` (frontend). See "Three layers of testing" below for what this
  is and isn't expected to cover locally.
- Backend-touching PRs' DB-backed tests live in `backend/api.tests/Api/`, tagged
  `[Trait("Category","Integration")]`, using the shared `IntegrationFixture` — they skip (not fail)
  when no Postgres is reachable, via `Skip.If(fixture.UnavailableReason is not null, ...)`.

## Three layers of testing — know which one you're actually running

Don't stand up a local Postgres as a matter of routine before opening a PR — that duplicates a
layer that already exists and just adds friction. The three layers are deliberately
non-overlapping:

1. **Local / pre-PR (you, right now): unit + component tests only.** Run `dotnet test
   backend/Heliograph.slnx` with **no** `KHET_TEST_DB` set, and `npm run lint && npm run test && npm run
   build` from `/web`. The `[Trait("Category","Integration")]` tests in `backend/api.tests/Api/`
   will **skip, not fail** — that is the expected, sufficient result now, not a gap to fill. No
   Docker/Postgres needed locally.
   Also: **never attempt to reach `192.168.0.20`** (the owner's home-LAN Postgres) from an agent
   environment — it's a private LAN address, unreachable from a sandbox or cloud run, and a
   "connection refused" there is expected, not a bug to chase.
2. **CI (`.github/workflows/ci.yml`): the authoritative DB-backed gate.** It runs a real
   `postgres:16` service container, so `Integration`-tagged tests actually execute there. This is
   the one place DB-backed correctness gets verified — trust it rather than re-verifying locally.
   If you're specifically debugging a DB-related failure (not routine pre-PR verification), the
   `khet-test-db` skill stands up the same throwaway Postgres CI uses.
3. **Manual / live (the owner, on the deployed app):** anything only visible under real
   timing/multi-client conditions (SignalR races, turn-state desync) isn't caught by 1 or 2. It
   surfaces from actually playing the deployed app, and gets diagnosed from the deployed api
   container's persisted Serilog file log — see `GOTCHAS.md`'s "Retrieving the deployed api's log
   file" entry for the retrieval convention — and/or the DB-backed in-app bug-report feature
   (`docs/backlog/10-bug-traceability.md`), which captures client-side state a server log
   structurally can't.

## Working from a `docs/backlog/*.md` file

If you were spawned to implement a plan under `docs/backlog/`, that file is the spec — read it in full
before writing any code. It pins the exact wire contract (routes, JSON shapes, hub event names) so
you can build against it without waiting on whoever's building the other half. Its "Owner decisions
already made" section closes off product ambiguities already resolved — don't re-litigate them.
For anything else genuinely ambiguous (not an ordinary implementation judgment call): don't guess.
Edit the plan file's frontmatter to `status: blocked` plus a one-line `blocker:` explaining what's
unresolved, stop without opening a PR, and say so clearly in your final report.
