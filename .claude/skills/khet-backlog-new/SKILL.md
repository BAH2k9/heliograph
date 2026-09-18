---
name: khet-backlog-new
description: Scaffold a new backlog/NN-slug.md item in khet-web from user-supplied feature scope — picks the next number, fills the standard frontmatter and section shape, and flags anything it can't fill in rather than inventing it. Use whenever a task is to add a feature idea, request, or piece of scope to the backlog (not to implement an existing backlog item — that's khet-backlog-work).
user-invocable: false
---

# khet-backlog-new — scaffolding a `backlog/NN-slug.md` item

`backlog/` is the repo's persistent, prescoped feature backlog (see the root `CLAUDE.md`'s
"Working from a `backlog/*.md` file" section). This skill is for the opposite direction from
`khet-backlog-work`: turning a feature idea into a new, correctly-shaped backlog file, not
implementing one that already exists. The frontmatter/shape contract a new file must match is
defined below, in "Filling it in" — this skill is its own source of truth for that shape.

## Before writing the file

1. List `backlog/*.md` and find the highest existing `NN` prefix; the new file is `NN+1`
   (zero-padded to two digits, e.g. `11-`, not `9-`), unless the user names a different number
   explicitly.
2. Skim 2-3 existing items (mix of `done` and `ready`) as shape references — the exact section
   headers vary a little by feature (a UI-only feature may not need a "Wire contract" section; a
   pure-backend one may not need "Frontend scope"), but every file has: a title, an owner-decisions
   section, and enough detail that a backend/frontend agent could implement it without asking the
   user anything the plan doesn't already answer.

## Filling it in

Frontmatter is fixed shape, not optional:

```yaml
---
feature: <slug>
status: ready
depends_on: []
backend_branch: feat/<slug>-be
frontend_branch: feat/<slug>-fe
---
```

- `depends_on` lists other backlog slugs (not filenames) that must be `status: done` first — leave
  `[]` unless the user names a dependency or one is obvious from the scope itself (e.g. a feature
  that extends another's wire contract).
- Branch names follow the root `CLAUDE.md` convention: `feat/<slug>-be`/`-fe` when the feature
  splits backend/frontend, plain `feat/<slug>` (single branch, no split) for a frontend-only or
  backend-only feature — see `backlog/05-pwa.md` for the frontend-only shape (no `backend_branch`
  key at all, one squash-merged PR).
- New items start `status: ready`. Never write `blocked` or `done` into a freshly scaffolded file.

Body sections to include, adapted to what the feature actually needs:
- **Why** — the problem/gap this closes, in a sentence or two.
- **Wire contract** (if backend-touching) — exact routes, request/response shapes, hub event
  names, pinned precisely enough that a backend and frontend agent could build against it without
  talking to each other.
- **Backend scope** / **Frontend scope** — concrete files/areas to touch, following the "which
  project" table in the root `CLAUDE.md` for backend work.
- **Tests** — what must be covered, and where (unit vs. `api.tests/Api/` `Integration`-tagged).
- **Out of scope** — anything explicitly deferred, so an implementing agent doesn't scope-creep.
- **Owner decisions already made** — every product ambiguity the user has already resolved during
  this scaffolding conversation. This section is what lets `khet-backlog-work` treat those
  decisions as closed instead of re-litigating them later — capture the user's actual answers,
  don't paraphrase away the specifics.

## When scope is incomplete

Don't invent a wire contract, an owner decision, or a scope boundary the user hasn't actually
given you. If a section can't be filled from what you've been told, either ask the user (this
skill runs interactively — prefer asking now, while scoping, over leaving a gap for whoever
implements it later) or leave the section explicitly marked as unresolved (e.g. "Wire contract:
not yet pinned — TBD before implementation starts") rather than silently guessing. A backlog item
with an honest gap is more useful than one with a fabricated contract nobody actually decided on.

## After writing

Tell the user the assigned number and slug, and point out anything you left unresolved. Don't
flip `status` away from `ready` yourself — that's the implementing agent's job once work actually
starts (`khet-backlog-work`).

Add a row for the new item to `backlog/INDEX.md` (title + one-line summary + `ready`) — that file
is the running title/summary/status index across the whole directory, kept alongside but separate
from each item's own frontmatter.
