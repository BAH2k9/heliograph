---
name: khet-bugfix
description: Reproduce, fix, and verify a khet-web bug the way this repo expects — repro before fix, verify against the same repro, and an honest needs-owner-check status for anything only a live browser session can confirm. Use whenever asked to fix a bug, triage a bug report, or file a new one into docs/bugs/.
user-invocable: true
---

# khet-bugfix — reproduce → fix → verify → close

Replaces "describe the bug in chat, hope the fix lands, re-verify by hand." A bug lives in
`docs/bugs/<slug>.md` so the hand-off across turns/sessions is a file, not a re-explanation. This skill
is the mandatory sequence for working one of those files. There is no CI hook or `.claude/settings.json`
enforcement behind any of this — it's workflow discipline. The real teeth are (a) the regression
test added for backend bugs, which is durable, and (b) `needs-owner-check` as the honest terminal
state for anything a self-graded browser session can't actually prove.

## Filing a new bug

If you're asked to file a bug rather than work an existing one, create `docs/bugs/<slug>.md`:

```markdown
---
status: open   # open | reproduced | needs-owner-check | verified | wontfix | blocked
area: web | api | realtime
reported: YYYY-MM-DD
---
## Report
(the original description, verbatim)

## Notes
(freeform — append here on every later pass; re-read this section fresh each time you pick the
bug back up, it may have been updated since your last pass)

## Repro steps
(filled in during Step 1)

## Root cause
(filled in once found)

## Fix
(commit/PR link once done)

## Verification
(what was actually checked, and how — see Step 3)
```

`status` has no `fixed` value — a fix with no verification recorded yet is not a state this skill
leaves things in. Every pass through this skill ends at `reproduced`, `verified`,
`needs-owner-check`, or `blocked`.

If the app's own in-app "Report a bug" flow already filed a `BugReport` row for this incident, that
data is DB-only today (no export tooling exists yet — out of scope for this skill) and reachable
only from the owner's machine. Ask the owner for the relevant details rather than trying to query
`192.168.0.20` yourself; don't let its absence block filing the `docs/bugs/*.md` file from the
description you were given.

## Step 1 — reproduce first, always

No fix work starts until the failure actually happens in front of you and you understand the
mechanism. Guessing a root cause from the description alone is exactly the "fixes the wrong thing"
failure mode this skill replaces.

**Backend / engine / logic bug** (rules, clock, Elo, room/game orchestration, anything in
`Heliograph.Engine`, `Heliograph.Clock`, `Heliograph.Contracts`, or `backend/api/`): write a failing test in `backend/api.tests/` or
`Heliograph.Engine.Tests` that demonstrates it. If it genuinely can't be captured as a test, say why in
the file's `Repro steps` section instead of skipping this step silently.

**Frontend / UI or realtime-sync bug** (`web/src`, SignalR fan-out, two-client turn sync,
disconnect races): use the `run` skill to start the dev server, then drive `claude-in-chrome`
against the exact repro steps **in a forked subagent** — the fork keeps screenshot/DOM-dump noise
out of the main conversation, it does not by itself reduce token spend, so keep the repro script
short and prefer `get_page_text` / `read_console_messages` / `read_network_requests` over
screenshots (screenshot only for a genuinely visual bug — layout/CSS).

- **This entire browser-driven path is owner-machine-only.** `claude-in-chrome` needs a live Chrome
  instance with the extension's site permissions already granted — it cannot run unattended from a
  cloud/orchestrator-spawned agent with no attached browser. If you're running in such an
  environment: get as far as a backend/test-based repro allows, then leave the file at `open` (with
  what you tried, in `Notes`) or `reproduced` if you got that far — do not fake a browser check.
- **Realtime/multiplayer bugs needing two live players:** prefer the bot opponent
  (`POST /api/games/bot`, `backend/api/Services/BotService.cs`, exercised in
  `backend/api.tests/Api/BotGameIntegrationTests.cs`) driving one side over two browser tabs, wherever the
  bug allows it — it's cheaper and sidesteps the next problem entirely. When two real clients are
  unavoidable: `web/src/authStore.ts` keeps session tokens in `localStorage`, which is shared
  per-origin, so two tabs of the same Chrome profile will have P1 and P2 stomp each other's auth.
  Use two separate browser profiles (or one normal tab + one incognito window) so each has its own
  session.

Once reproduced, write the **exact** steps into `Repro steps` — not a paraphrase of the original
report. Set `status: reproduced`.

## Step 2 — fix

Follow the normal house conventions in the root `CLAUDE.md` and (for `/web` work) `web/CLAUDE.md` —
this skill doesn't add or relax any of those. Record the root cause in the file's `Root cause`
section once you understand it, before or while you fix it.

## Step 3 — verify against the *same* repro, and be honest about what that proves

- **Backend/logic bug:** the failing test from Step 1 now passes. This is real, durable
  enforcement — it re-runs in CI forever. This is the one case where a self-assigned `verified` is
  trustworthy. Record it in `Verification` and set `status: verified`.
- **Frontend/UI or realtime bug checked via an ad-hoc browser session:** that session leaves no
  durable artifact, and Claude grading its own browser session is exactly how "claims fixed but
  isn't" happens. Record precisely what was checked in `Verification`, but set
  `status: needs-owner-check`, not `verified` — only the owner flips it to `verified` after their
  own look. This is the honest terminal state for this class of bug, not a shortcut to avoid or
  apologize for.

Add the regression test in the same PR wherever Step 1 produced one to keep (usually it's the same
test, now passing). Not every frontend/UI bug can get one without real e2e infrastructure, which is
out of scope here — say so plainly in `Verification` rather than skip it silently.

**`GOTCHAS.md` hygiene:** if the bug was a genuine non-obvious cross-cutting trap, add an entry in
its existing format. If fixing it means an existing `GOTCHAS.md` entry no longer applies, delete
that entry in the same PR — that's the file's own stated rule, and letting it rot is exactly the
mistake this skill exists to stop repeating.

## Closing out

Once `status` is `verified` (or the owner has flipped a `needs-owner-check` file to `verified`
themselves) and the fix has merged, delete the `docs/bugs/<slug>.md` file. `docs/bugs/` prunes individual
closed-and-confirmed files as it goes, unlike `docs/backlog/`, which keeps `done` items as a historical
record.

## Also worth knowing

- Don't cite `docs/backlog/*.md` from a bug file or from generated code — cite real source files
  instead; a backlog item records product scope, not the implementation itself.
- No Playwright/Cypress and no `.claude/settings.json` hooks exist in this repo, and adding either
  is out of scope for this skill — `needs-owner-check` is the deliberate substitute for a
  verification gate that would otherwise need real e2e infrastructure.
- Once a fix is done and its gates pass, use the `khet-pr` skill for the commit/PR body.
