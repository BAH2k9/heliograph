# GOTCHAS — traps and deferred work

Cross-cutting things that will bite you, and things deliberately not built yet. This is the
project's running "watch out for" list, replacing the notes that used to live in an external
Obsidian vault. Module-local invariants stay in the relevant `CLAUDE.md`; this file is for what
spans modules or isn't obvious from the code in front of you.

**Maintaining this file:** cite `file:line` (or a commit) for every entry so it stays checkable.
When a trap is genuinely fixed, delete its entry rather than annotating it — a stale warning costs
more than no warning. Add an entry when you hit something that cost you time and wasn't visible
from the code you were editing. Do not turn this into a backlog of proposed changes.

---

## Traps

### Laser-reflection lookup — do not "fix" a failing frame test by flipping the table
`Khet.Engine.Tests/LaserReflectionFrameTests.cs:43`, cross-referenced from
`BoardLayoutTests.cs:10`. The reflection lookup has a known entry-side subtlety; a failure in these
tests almost always means new code is reading the table wrong, not that the table is wrong.
Flipping the lookup to make the test pass "flips the bug back in" (the test file's own words).

### The client mirrors engine rules — the server is still the only referee
`web/src/game/rules.ts`, `board.ts`, `laser.ts`, `coords.ts`, `inferMove.ts` are a hand-written
copy of `Khet.Engine` used only for highlighting / snap-back / optimistic animation. On any
disagreement the server wins silently (`web/src/game/board.ts:125`, `matchesServer`). A rule change
in `Khet.Engine` must move the mirror (and its `game/*.test.ts`) in the same PR. See
`web/CLAUDE.md`.

### Stale "keep in sync" paths in the frontend mirror
`web/src/game/rules.ts:8` points at `api/Engine/GameEngine.cs` and `web/src/game/timeControls.ts`
points at `api/Domain/TimeControl.cs` — both moved out during the `Khet.Engine` / `Khet.Clock`
extractions (commits `72a1305`, `8e01108`). The real sources are `Khet.Engine/GameEngine.cs` and
`Khet.Clock/TimeControl.cs`. The comments are stale, the mirroring obligation is not.

### DI lifetime of the game-flow services must stay `Scoped`
`GameService` and its collaborators (`GameEndService`, `GameClockLifecycle`, `GameResponseMapper`,
`RoomService`) share one per-request `KhetDbContext`, and that shared context is what makes
single-transaction atomicity real. A `Singleton` / `Transient`-with-its-own-context
mis-registration breaks atomicity **with every behavioural test still green**. Guarded by
`api.tests/Services/ServiceRegistrationTests.cs`; `api/Program.cs:45-56` and the two service doc
comments say "do not change the lifetime". Believe them.

### One captured `now` per request
Inside `SubmitMoveAsync` every clock decision reads a single `now = Now()` captured up front; a
second `time.GetUtcNow()` / `DateTime.UtcNow` later in the method is a timing-semantics change that
**no test catches** (`api/Services/GameService.SubmitMove.cs`, and `GameClockLifecycle`'s doc
comment). Conversely `RoomService.JoinRoomAsync` deliberately captures `now` *immediately before*
`InitializeClock` rather than hoisting it — hoisting shifts `TurnStartedAtUtc` / `TurnDeadlineUtc`
by the query latency (noted in commit `33494ec`).

### `<see cref>` doc references are not compiler-checked
The API project has no `GenerateDocumentationFile`, so `<see cref="...">` in doc comments can rot
silently — a rename won't break the build. Commit `33494ec` had to repoint two that pointed at
methods which had moved. If you move a method, grep for its name in doc comments.

### A green `dotnet test Khet.slnx` may not have run the integration tests
The `[Trait("Category","Integration")]` tests in `api.tests/Api/` **skip, not fail**, when no
Postgres is reachable (`Skip.If(fixture.UnavailableReason is not null, ...)`). A "all green" run
with those skipped has not exercised the HTTP/EF/SignalR layer at all. Start a throwaway
`postgres:16` and set `KHET_TEST_DB` (see the root `CLAUDE.md` section on this) before trusting a
backend PR locally, and say in the PR body whether they actually ran.

### The service worker must be `no-cache`, or installed PWA clients never see a new deploy
`web/nginx.conf` serves everything outside `/assets/` (which Vite content-hashes) with
`Cache-Control: no-cache`, specifically so `sw.js`/`workbox-*.js` get revalidated every request. If
that header regresses, a browser (or an intermediate cache) can keep serving an old service worker
indefinitely — no error anywhere, the app just silently stops updating for anyone who installed it.
`web/src/components/PwaUpdatePrompt.tsx`'s "new version" toast only ever fires once a client
actually re-fetches `sw.js` and finds it changed.

### iOS PWA storage eviction clearing `localStorage` is expected, not a bug
An installed iOS PWA can have its `localStorage` evicted under storage pressure — this drops
`authStore`'s tokens (`web/src/authStore.ts`), same as any other `localStorage` clear. The app
already tolerates it (falls back to a login prompt via `refreshSession.ts`); if it's ever reported
as "logged out for no reason" on iOS, that's the known tradeoff from `plans/05-pwa.md`, not a fetch
or token-refresh bug.

### `192.168.0.20` "connection refused" after a reboot / network change — check ARP first
Carried over from the old infra notes. Windows once cached a stale ARP entry mapping `.20` (the DB
host on the home LAN) to a device that previously held that DHCP lease, and DBeaver/Npgsql got
refused while Postgres was perfectly healthy. If it recurs, as admin:
`Remove-NetNeighbor -IPAddress 192.168.0.20 -Confirm:$false`. Shouldn't happen under normal use
(the container has a fixed IP and `onboot: 1`), but it's not a code or Postgres fault when it does.
Irrelevant to cloud/sandbox agents, which can't reach that LAN address anyway.

---

## Deliberately deferred

### Unify all four game endings behind `FinishGameAsync`
Commit `33494ec` states this as a known follow-up carrying "its own behaviour-change budget" —
today the Pharaoh win is still set inline in `SubmitMoveAsync` and calls `ApplyEloAsync` directly,
while timeout / resignation / abandonment route through `FinishGameAsync`. Recorded here because
the commit named it, not as a recommendation to do it now.

### Dev/prod database separation
Discussed in the old infra notes: split into `khet_dev` / `khet_prod` on the one Postgres instance
rather than a second container. Deliberately not done. Revisit before anything resembling real
external deployment.

### `plans/` points at a vault path that no longer applies
`plans/README.md` references an Obsidian vault under `...Nextcloud\Bailey\PC data\ObsidianVault\...`
as a source of truth. That vault is being dropped and the path was already wrong. Don't wire
anything new to `plans/*.md` — the directory is disposable process scaffolding slated for deletion
once its backlog is all `done` (per its own README). The lone `plans/…` reference in
`api/Services/GameService.Endings.cs` records an owner decision and can stay as prose.
