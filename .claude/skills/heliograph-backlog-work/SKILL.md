---
name: heliograph-backlog-work
description: Work from a docs/backlog/*.md spec file in heliograph-web the way the repo expects — read it fully before coding, treat its owner decisions as closed, and block rather than guess on genuine ambiguity. Use whenever a task says to implement a docs/backlog/*.md file, or a backend/frontend half of one.
user-invocable: false
---

# heliograph-backlog-work — working from a `docs/backlog/*.md` spec

Encodes the root `CLAUDE.md` section "Working from a `docs/backlog/*.md` file". If you were
spawned to implement something under `docs/backlog/`, that file *is* the spec.

## Before writing any code

1. Read the entire plan file — not just the section that looks relevant. It pins the
   exact wire contract (routes, JSON shapes, hub event names) so a backend half and a
   frontend half can be built independently without waiting on each other. Skipping
   ahead risks inventing a contract the other half doesn't match.
2. Check the frontmatter `status:`. If it's already `blocked`, stop and surface that —
   don't try to unblock it yourself unless the blocker is explicitly resolved elsewhere
   in the conversation.
3. Find the "Owner decisions already made" section (or equivalent). Every ambiguity it
   closes off is **closed** — do not re-litigate it, re-ask the user about it, or
   substitute your own judgment for it, even if you'd have chosen differently.

## When something is genuinely ambiguous

This means: not covered by the plan, not an ordinary implementation judgment call (e.g.
"which private helper to factor this into" is your call; "should a spectator see the
opponent's remaining time" is not, unless the plan says).

Do not guess. Instead:
1. Edit the plan file's frontmatter to `status: blocked`.
2. Add a one-line `blocker:` field stating exactly what's unresolved.
3. Stop without opening a PR.
4. Say so clearly in your final report to whoever spawned you — name the blocker in
   plain language, don't bury it in a longer summary.

## Keep the index current

`docs/backlog/INDEX.md` is a running title/summary/status table across the whole directory, separate
from each item's own frontmatter. Whenever you change a plan file's `status:` (to `blocked`,
`in-progress`, or `done`), update that item's row in `INDEX.md` to match in the same pass — don't
leave the two out of sync.

## Also worth knowing

- `docs/backlog/` is a permanent, persistent tracker, not disposable process scaffolding — a
  `done` item's file stays in the repo as a historical record rather than getting
  deleted. Don't build new tooling that assumes the directory or a given item's file
  will disappear once it's done.
- The root `CLAUDE.md` and (for frontend work) `web/CLAUDE.md` still apply in full
  alongside the plan — the plan pins the contract and closes product ambiguity, it
  doesn't override house engineering conventions (DI lifetimes, the claim pattern, the
  server-is-referee rule, etc.).
- Once the implementation is done and gates pass, use the `heliograph-pr` skill to write the
  commit/PR body, pulling deferred-scope and owner-decision callouts straight from the
  plan file's own language where possible.
- To scaffold a *new* backlog item (rather than implement an existing one), that's the
  `heliograph-backlog-new` skill's job, not this one.
