---
name: khet-plan
description: Work from a plans/*.md spec file in khet-web the way the repo expects — read it fully before coding, treat its owner decisions as closed, and block rather than guess on genuine ambiguity. Use whenever a task says to implement a plans/*.md file, or a backend/frontend half of one.
user-invocable: false
---

# khet-plan — working from a `plans/*.md` spec

Encodes the root `CLAUDE.md` section "Working from a `plans/*.md` file". If you were
spawned to implement something under `plans/`, that file *is* the spec.

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

## Also worth knowing

- `GOTCHAS.md` notes `plans/` itself points at a dead Obsidian-vault path in its own
  README and is slated for deletion once its backlog is all `done` — don't wire new
  tooling to assume `plans/` is permanent, and don't "fix" that stale vault reference,
  it's a known, accepted rot.
- The root `CLAUDE.md` and (for frontend work) `web/CLAUDE.md` still apply in full
  alongside the plan — the plan pins the contract and closes product ambiguity, it
  doesn't override house engineering conventions (DI lifetimes, the claim pattern, the
  server-is-referee rule, etc.).
- Once the implementation is done and gates pass, use the `khet-pr` skill to write the
  commit/PR body, pulling deferred-scope and owner-decision callouts straight from the
  plan file's own language where possible.
