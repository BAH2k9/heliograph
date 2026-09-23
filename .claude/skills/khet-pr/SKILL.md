---
name: khet-pr
description: Generate a commit message or PR description in this repo's house format (subject line convention, BE-n/FE-n tags, bullet-per-concern body, test-count closer). Use when asked to write a commit message, draft a PR description, or open a PR for khet-web.
user-invocable: true
---

# khet-pr — house commit/PR message format

Encodes the root `CLAUDE.md` "Git / PR workflow" section. Every PR in this repo is a
single squash-merged commit, so the commit message *is* the PR body — get it right
once.

Once the message is drafted and the pre-PR gates below pass, push the branch and run
`gh pr create` with this message straight away — `CLAUDE.md` pre-authorizes that step,
so don't stop to ask permission to open the PR itself. If the user later asks for
changes, push more commits to the same branch rather than opening a second PR.

## Before writing the message

1. Figure out what's actually in scope: `git diff main...HEAD` (or the equivalent range)
   plus `git log` for that range. Read every changed file's diff, not just the file
   names — the body has to explain *why* per file/concern, which requires actually
   knowing what changed.
2. Check whether this branch came from a `docs/backlog/*.md` file. If so, read it — the "Owner
   decisions already made" section and any deferred-scope notes belong in the PR body.
3. Run the test command for whatever was touched (backend: `dotnet test backend/Heliograph.slnx`,
   possibly via the `khet-test-db` skill; frontend: `npm run lint && npm run test && npm
   run build` from `/web`) and note the resulting pass count/delta — this is a required
   closing line, not optional color.

## Format

**Subject line:** `<area>: <what>` where `area` is one of `api` / `web` / `engine` /
`test` / `ci` / `chore` / `fix`. If this PR is one half of a multi-PR feature, append
the tag the branch name implies — `BE-1`, `FE-2`, etc. (see branch-naming below). Keep
the subject under ~70 characters, imperative mood, no trailing period.

**Body:** one bullet per file or concern, explaining **why**, not just what changed —
restating the diff in prose is not useful, the reviewer can read the diff. Call out
explicitly:
- Any scope that was deliberately deferred (and why it's deferred, not just "TODO").
- Any product/"owner" decision that was made along the way (e.g. a default chosen, an
  edge case resolved) — these are easy to lose track of later if not written down here.

**Closing line:** the test count and delta, naming what's newly covered, e.g.:
`142 tests passing (6 new: resignation ends the game, spectator rejected, ...)`.
If integration tests were skipped (no reachable Postgres in this environment), say that
explicitly here instead of letting a skip-only run read as fully verified.

**Attribution:** whatever the current session's system instructions specify for commit
trailers — check for a `Co-Authored-By` / session-link convention already given in this
conversation before writing the final message; don't invent one and don't omit it if
one was given.

## Branch naming (for reference, not something this skill sets up)

`feat/<slug>` for a single-PR feature; `feat/<slug>-be` / `feat/<slug>-fe` when a
feature splits into a backend half and a frontend half (further split into
`-be1`/`-be2`/... only if a backend half itself needs multiple sequential PRs). `fix/`
for bug fixes, `chore/` for non-feature repo maintenance.

## Example shape

```
api: add claim-abandonment endpoint for disconnected opponents (BE-2)

- backend/api/Services/GameService.Endings.cs: new ClaimAbandonmentAsync, following the same
  "claim" pattern as ClaimTimeoutAsync — re-checks LastSeenUtc server-side rather than
  trusting the caller, per root CLAUDE.md's claim-pattern convention.
- backend/api/Controllers/GamesController.cs: new POST /api/games/{id}/claim-abandonment route.
- Deferred: no client-side countdown UI yet — that's FE-2, tracked in docs/backlog/12-abandon.md.
- Owner decision: abandonment threshold is 60s of no heartbeat, not configurable per
  time control (docs/backlog/12-abandon.md, "Owner decisions already made").

148 tests passing (4 new: abandonment claim succeeds after threshold, claim rejected
before threshold, claim rejected on already-finished game, broadcasts gameEnded).
```
