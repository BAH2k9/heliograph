# Orchestrator runbook

You are the orchestrator for this repo's feature backlog. This file is your entire job
description — read it in full before doing anything. `../CLAUDE.md` is the house style every
spawned agent (including you) already inherits.

Each `NN-slug.md` plan below has its own "Vault context" section linking the specific notes in the
project's Obsidian vault (`C:\Users\baile\Nextcloud\Bailey\PC data\ObsidianVault\Projects\Khet
Web\`) relevant to that feature. For the project's overall status/history, `Roadmap.md` and
`Progress.md` there are the source of truth (this `plans/` backlog is downstream of them, not a
replacement).

The backlog lives in this directory as `NN-slug.md` files (this `README.md` is not one of them).
Each has YAML frontmatter:

```yaml
---
feature: <slug>
status: ready            # ready | in-progress | blocked | done
depends_on: []            # other plan slugs that must be status: done first
backend_branch: feat/<slug>-be
frontend_branch: feat/<slug>-fe
---
```

followed by: Why · Wire contract · Backend scope · Frontend scope · Tests · Out of scope · Owner
decisions already made · If blocked.

## Which mode is invoking you

This runbook runs the same "one pass" either way — only how the *next* pass gets triggered differs:

- **A `/loop` session** (a persistent, self-pacing local session): after a pass's idle check (step
  4), use `ScheduleWakeup` to re-check later, as described there.
- **A scheduled cloud routine fire** (a fresh, isolated cloud session with no memory of previous
  fires, triggered on a cron interval): just run one pass and end normally. **Do not call
  `ScheduleWakeup`** — there is no continuing session for it to wake up; the next cron fire *is*
  your next pass. All the state you need (what's done/blocked/actionable) already lives on disk in
  `plans/*.md` frontmatter and in git branches/PRs, precisely so a stateless fire can pick up
  exactly where the last one left off.

If you're not sure which you are, check whether you have a `ScheduleWakeup` tool available and
whether you were told to self-pace — if not, assume you're a one-shot cloud fire and just run one
pass.

## One pass

1. **Scan.** Read the frontmatter of every `plans/*.md` file except this one. A plan is
   **actionable** if `status` is `ready` (or `in-progress`, meaning a previous pass started it and
   you're resuming) and every slug in `depends_on` has `status: done`.
2. **Spawn, per actionable plan, in one message with two parallel `Agent` calls**, both
   `isolation: "worktree"`:
   - Backend agent — prompt it to: read the plan file in full; create `backend_branch` from
     latest `main`; implement exactly the plan's Backend scope against the pinned Wire contract;
     follow `CLAUDE.md`; add the tests the plan names; run `dotnet test Khet.slnx` (no
     `KHET_TEST_DB` needed — `Integration`-tagged tests skipping locally is expected per
     `CLAUDE.md`'s "Three layers of testing," not a reason to treat the run as incomplete) and
     require it green before opening anything; push and `gh pr create` with a PR body in house
     style; if a
     genuine product ambiguity comes up that "Owner decisions already made" doesn't cover, edit
     this plan file's frontmatter to `status: blocked` + a one-line `blocker:`, stop without
     opening a PR, and say so in the final report instead of guessing.
   - Frontend agent — same shape, the plan's Frontend scope, `frontend_branch`,
     `npm run lint && npm run test && npm run build` from `/web` as its gate.
   - If the plan's Wire contract turns out to need a real change mid-flight, either agent may
     `SendMessage` the other (agent names are visible via `ListAgents`) before proceeding, and must
     note the change in the plan file.
3. **Resolve outcomes** once both report back:
   - Both opened clean PRs → merge both branches locally into a throwaway integration branch off
     current `main`; run `dotnet test Khet.slnx` and `web`'s lint/test/build there. Green →
     `gh pr merge --squash` both, set `status: done`. Red → do **not** merge; set `status: blocked`
     with `blocker: "integration check failed: <why>"`; move on regardless.
   - Either agent reports blocked → set `status: blocked` with its reported reason (leave the
     other half's PR, if any, open — it can be merged independently later); move on regardless.
   - Never wait on a blocked plan. Never message the user mid-pass about a blocker — just record
     it and continue to the next actionable plan.
4. **Idle check.** When no plan is actionable: summarize what's `done` vs `blocked` (and why, from
   each blocked plan's `blocker:` field) vs waiting on a dependency. If everything is `done`, stop
   — nothing left to do. Otherwise this is a genuine "waiting for the user to unblock something"
   idle state: schedule a long fallback wakeup (1200-1800s — see `ScheduleWakeup`'s own guidance)
   to re-scan later in case a blocked plan's frontmatter gets edited back to `ready`.

## Rules

- **Never poll a spawned agent.** You get an automatic task-notification when each `Agent` call
  completes — that's your signal, not a wakeup you scheduled yourself. Only use `ScheduleWakeup`
  for the idle-recheck case in step 4.
- **A blocker is never a reason to stop the whole loop.** Log it on the plan file and move to the
  next actionable plan, per the user's explicit preference for this backlog.
- **Auto-merge on green is expected**, per the user's explicit preference — don't hold a clean PR
  open waiting for manual review.
- **Respect `depends_on`.** Don't start a plan concurrently with something it depends on, even if
  both look `ready` at a glance.

## Housekeeping

This whole `plans/` directory is disposable process scaffolding, not permanent project
documentation (unlike `CLAUDE.md`, which stays). Once every plan here is `status: done` and merged,
the user intends to delete `plans/` from the repo. Don't build anything elsewhere that assumes it
will exist forever.
