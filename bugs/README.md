# bugs/ — the bug queue

One `.md` file per open bug, in the format the `khet-bugfix` skill writes and reads. This
replaces re-describing a bug to Claude in prose every time it comes back into scope.

Unlike `plans/` (disposable feature scaffolding slated for bulk deletion once its backlog is
done), this directory is **not** disposable as a whole — individual files are deleted one at a
time, once their fix has merged and been confirmed, the same way a fixed `GOTCHAS.md` entry gets
deleted rather than left stale.

See `.claude/skills/khet-bugfix/SKILL.md` for the workflow and the file template. Don't invent a
different shape for a new bug file — use the skill.
