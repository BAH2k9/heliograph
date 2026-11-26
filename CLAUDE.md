# heliograph-web

Web multiplayer board game of mirrors and light: ASP.NET Core API, React frontend, Postgres, SignalR.
This file says what an edit must not break. Current state never goes here.

## Read first

- `.claude/context/ARCHITECTURE.md`: for "where do I make change X", read section 9.
- `.claude/context/GOTCHAS.md`: skim before a non-trivial change; add an entry (with a `path:Symbol` cite) when something costs you time.
- `web/CLAUDE.md` for any `web/` task. Each backend project has its own `CLAUDE.md`; open the narrowest one:
  `Heliograph.Engine` (rules), `Heliograph.Clock` (clock math, presets), `Heliograph.Contracts` (DTOs, jsonb shapes), and
  `Heliograph.Api` (`backend/api`, the fallback for everything else).
- `.claude/context/MODULE_NOTES.md`: reference prose trimmed out of the nested CLAUDE.md files.

## Read when relevant

- Bug reports: `docs/bugs/*.md`, via the `heliograph-bugfix` skill. Feature specs: `docs/backlog/*.md`.
- Short IDs in comments (`IP-02`, `TLS-02`, `LOG-02`, `SEC-08`) point to the maintainer's private tracker. The surrounding comment is the explanation.

## Boundaries

- `Heliograph.Engine`, `Heliograph.Clock` and `Heliograph.Contracts` depend on nothing but the BCL, and `Heliograph.Api` references them, never the reverse. *(compiler: the csproj reference graph)*
- A named-preset concept follows the registry shape (`RuleSets`, `BoardLayouts`, `TimeControls`): a static dictionary plus `For(name)` that throws `UnknownXException` (400). *(unenforced)*
- Never reach the maintainer's private dev database (`<db-host>`) from an agent; "connection refused" there is expected. *(unenforced)*

## Verify, and what each check does not cover

- Backend: `dotnet test backend/Heliograph.slnx` with no `HELIOGRAPH_TEST_DB` set. The `[Trait("Category","Integration")]` tests in `backend/api.tests/Api/` skip, not fail. That is expected and sufficient locally.
- Frontend, from `web/`: `npm run lint && npm run test && npm run build`.
- DB-backed correctness is verified only by CI's `postgres:16` service container (`.github/workflows/ci.yml`). Don't stand up a local Postgres as routine; the `heliograph-test-db` skill is for debugging a DB failure.
- Real-time races and turn desync show only on the deployed app. Retrieval of its log: GOTCHAS, "Retrieving the deployed api's log file".

Report the command and its output, not "tests pass". Never delete, skip or weaken a test to get green.

## Non-negotiables

- Tests ship in the same PR as the feature, never a follow-up. *(unenforced)*
- Don't change the lifetime of `GameService` and its collaborators from `AddScoped`. *(`backend/api.tests/Services/ServiceRegistrationTests.cs`)*
- Working from a `docs/backlog/*.md` spec: read it in full first and treat its "Owner decisions already made" as closed. If something is genuinely ambiguous, set the file's frontmatter to `status: blocked` with a one-line `blocker:`, open no PR, and say so in your report. *(unenforced)*
- No new runtime dependency without asking. *(unenforced)*

## Git

- Standing authorization to push a feat, fix or chore branch (named `<type>/<slug>`, never `main`) and run `gh pr create` once the gates above pass, without asking. It does not cover force-push, merge or other risky actions. Review changes go on the same branch and PR. *(unenforced)*
- Split features use the `-be` / `-fe` suffix. One squash-merged PR per branch. *(unenforced)*
- Commit and PR body: use the `heliograph-pr` skill (subject `<area>: <what>`, a bullet per concern explaining why, test count closer).

## Where a new fact goes

| A fact that… | goes in |
| --- | --- |
| constrains how an edit must be written | one imperative line in the nearest `CLAUDE.md` |
| can be checked by a machine | a test, lint or hook, and then delete the prose |
| is a trap that isn't visible from the code | `.claude/context/GOTCHAS.md` |
| is true only today (status, counts, a bug) | the status file or a `docs/backlog` / `docs/bugs` item |

Every rule names what catches a violation, or is marked `(unenforced)`. When docs and code disagree,
follow the code and name the conflict in your reply.
