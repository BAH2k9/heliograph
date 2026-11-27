# MODULE_NOTES — reference prose moved out of the nested CLAUDE.md files

Explanatory notes that were trimmed from the per-module `CLAUDE.md` files to meet the kit's 40-line cap
(moved verbatim, 2026-11-26). The enforced rules and commands stay in each module's `CLAUDE.md`. Paths in
the web section are relative to `web/src`. This is reference, not a contract: when it disagrees with the
code, follow the code.

## web (frontend)

### The one load-bearing idea: the server is the referee, the client only mirrors

`game/rules.ts`, `game/board.ts`, `game/laser.ts`, `game/coords.ts` and `game/inferMove.ts` are a
**hand-written mirror of `Heliograph.Engine`** (`GameEngine.cs` / `LaserReflection.cs` / the layout
constants). They exist purely for UX — legal-move highlighting, snap-back on an illegal drag,
optimistic slide/rotate/laser animation while the POST is in flight. They are never the authority.

- When the mirror and the server disagree, **the server wins, silently**: `matchesServer(computed,
  serverBoard)` returns false and the caller falls back to `identify(serverBoard)`
  (`game/board.ts:125`). A mirror bug degrades animation, never correctness.
- The `// Keep in sync with …` comments in `game/rules.ts` and `game/timeControls.ts` point at
  **pre-extraction paths** (`api/Engine/GameEngine.cs`, `api/Domain/TimeControl.cs`). The real
  sources are now `Heliograph.Engine/GameEngine.cs` and `Heliograph.Clock/TimeControl.cs`. See `../.claude/context/GOTCHAS.md`.
- If you change a rule in `Heliograph.Engine`, the matching mirror here must move with it in the same PR,
  and its `game/*.test.ts` with it. That's the same "tests in the same PR" rule as the backend.
  The player-facing rules text in `pages/HowToPlayPage.tsx` (and its hand-traced `RuleDiagram`
  beams) describes the same rules in prose, so a rule change updates that page too.

### Turn model (why the move API looks the way it does)

A turn is one action against a piece — `store.ts` exposes four: `moveTo`, `rotateSelected`,
`stackTo`, `unstackTo`, submitting `{ type: 'move' | 'rotate' | 'stack' | 'unstack' }` (stack /
unstack are Classic-ruleset only). Firing the laser is implicit and entirely server-side. Picking a
piece up, previewing, changing your mind — all client-only, never sent. Exactly one
`POST /api/games/{id}/moves` per committed turn; **there is no "fire laser" endpoint**. That's why
`store.ts`'s `submit()` drives the whole `slide → bullet → destroy → settle` sequence off a single
response payload (`playMoveResult`).

### Layout

| Path | What lives here |
|---|---|
| `api/` | Typed `fetch` wrappers (`client.ts`, `authClient.ts`), wire types (`types.ts`, `authTypes.ts`), and the auth transport (`authFetch.ts`, `refreshSession.ts`). No React. |
| `game/` | The pure engine mirror + board geometry. No React, no `fetch`, no stores — just functions over `ClientBoard` / `Coord`. Fully unit-tested. |
| `store.ts` | The zustand game store — the single source of client game state and every game action. Large and heavily commented; read the interface doc-comments before touching it. |
| `authStore.ts` | zustand + `persist` — tokens and `user`, in `localStorage` under `heliograph.auth`. |
| `inviteStore.ts` | zustand — pending match-invite state (`docs/backlog/07-friend-invites-matches.md`), kept out of `store.ts` the same way `FriendsPage` keeps friend-list state local: an invite list has nothing to do with an in-progress game. |
| `settings/displaySettings.ts` | zustand + `persist` — laser look and animation timings (`heliograph.displaySettings`). |
| `realtime.ts` | The single SignalR connection. Module-level singleton, not a hook. |
| `ui/` | The presentational primitive layer — `Button`, `Dialog`, `Field`, `Tabs`, `Panel`, `Badge` (+ `cn`). Radix under the interactive ones (focus trap, Escape, ARIA); styled with tokens. No store, no `fetch`, no game logic. |
| `components/` · `pages/` · `layout/` | React. `pages/` = route targets (see `App.tsx`), `layout/AppLayout.tsx` = the shell, `components/` = app components (compose `ui/` primitives). Flat — no per-folder CLAUDE.md; a typical change touches a component + `store.ts` + `game/` together. `pages/admin/` is the exception: admin-only routes gated by `RequireAdmin.tsx`. |

### Design tokens and the `ui/` layer

`src/index.css` `@theme` holds semantic **role** tokens — `surface` / `surface-raised` /
`surface-sunken`, `border`, `text` / `text-muted` / `text-subtle`, `accent`, `danger` /
`success` / `warning`, and the board roles (`square`, `legal`, `select`, …). Components use
`bg-surface`, `text-text-muted`, `ring-border`, never `slate-800`. Values are the app's dark
chrome (the only theme today); a light theme would override the same names, no component
churn. Static UI motion (`--duration-fast/base`, `--ease-standard`) lives here too — but the
**game** animation timings (`moveMs`, `deathMs`, laser speed) stay in `settings/displaySettings.ts`,
which is user-tunable at runtime.

`/kitchen-sink` (DEV-only route, `import.meta.env.DEV` in `App.tsx`) is the visual index of
every primitive and the store-free board renderers.

### REST is the source of truth; the hub only fans out

`realtime.ts` holds one connection to `/api/hub`, and it's no longer scoped to "following the
current game" only (`docs/backlog/07-friend-invites-matches.md`). The connection is a **persistent
singleton once started** and serves two independent purposes on the same socket:

- **Following a game** (original purpose): `followGame`/`unfollow` register the per-game handlers
  and `Join` the game's group. Its four inbound events — `moveApplied`, `gameEnded`,
  `opponentDisconnected`, `opponentReconnected` (plus `opponentJoined`) — are **broadcasts of
  decisions a controller already committed**, never independent state. `unfollow()` deliberately
  does NOT stop the connection — only clears the game-following state — so an authenticated user
  who's simply not in a game right now doesn't lose the invite subscription below.
- **Per-user invite delivery** (new): any authenticated client calls the hub's `SubscribeToUser`
  once per connect/reconnect (guests skip it — friend invites are an authenticated-only feature)
  to join the `user:{userId}` group and receive `inviteReceived` pushes **from anywhere in the
  app**, independent of whether a game is being followed — this is the frontend mirror of
  `GameHub` gaining its first non-game-scoped broadcast group. `subscribeToUserInvites()` is what
  opens the connection for a user who isn't playing a game at all (e.g. browsing `/friends`); the
  always-mounted `PendingInvitesTray` (in `AppLayout`) calls it.

A failed hub connect (or a dropped connection) leaves the REST game fully playable, and the
pending-invites list still has its own `GET /api/invites/pending` fallback poll; `onreconnected`
re-`Join`s the followed game (if any), re-invokes `SubscribeToUser` (auto-reconnect drops group
membership server-side), and triggers a `resync()`. Mirror of the backend `GameHub` doc comment.
Don't add client logic that only works when the hub is up.

`accessTokenFactory` is read live from `authStore` on every (re)connect, so logging in mid-game
reaches the next reconnect — but only on a genuine reconnect: `reconnectRealtime()` (called on a
login/logout identity change) uses `disconnect()`, a real teardown, specifically because
`accessTokenFactory` is read once at connect time and `unfollow()` alone wouldn't force a fresh
connect. Guest play sends `''` (no token). The Vite proxy must use the object form with
`ws: true` (`vite.config.ts`) — the string shorthand doesn't proxy the hub's WebSocket upgrade.

### The "claim" pattern, client side

`claimTimeout` / `claimAbandonment` in `store.ts` mirror the backend claim endpoints: fired from a
local countdown tick the instant it hits zero, **fire-and-forget**, and a `409` is expected and
benign (not actually expired yet, or someone else already resolved it). The authoritative outcome
always arrives via a `gameEnded` push or the next `resync()` — never trust the claim call's own
return. `resign()` is the exception: a deliberate user click, so a failure *does* surface in the
error banner.

### Clock

`serverOffsetMs` is recomputed (`serverNowUtc - Date.now()`) from **every** payload that carries
clock fields (`clockFields()` in `store.ts`), so `GameClock`'s local tick reads `Date.now() +
serverOffsetMs` and never accumulates drift against a skewed client clock. The chess clock is
**multiplayer-room-only** — local/solo games (`createGame`) are always untimed and never send a
`timeControl`.

### Auth transport

`authFetch` wraps every `/api/*` call: attaches the bearer token when present, and on a `401`
refreshes once then retries. The refresh token is **rotating and single-use**, so concurrent 401s
and the boot-time `hydrate()` all funnel through `refreshSession.ts`'s shared in-flight promise —
without it, two refreshes race and the loser fails with a rotated-away token. Tokens live in
`localStorage` (XSS tradeoff consciously accepted — see `authStore.ts`'s doc comment).

### Presets are mirrored catalogs, not fetched

`game/timeControls.ts` (↔ `Heliograph.Clock/TimeControl.cs`) and `game/gamePresets.ts` (↔ the backend
ruleset/layout registries) are hand-kept copies of fixed, non-user-configurable values. Adding a
preset is a two-repo-half change: backend registry + this catalog, same PR.


## Heliograph.Api

### What's in here

- **`GameService`** (`Services/GameService.cs` + `GameService.*.cs` partials — `.SubmitMove`,
  `.Endings`, `.Disconnect`, `.Bot`, `.Diagnostics`) and its `AddScoped` collaborators:
  `GameClockLifecycle` (clock *lifecycle* — `InitializeClock` / `UpdateClockAfterMove` /
  `PreMoveExpiry`; the pure arithmetic it calls into is `Heliograph.Clock`), `GameEndService` (the
  game-ending core + Elo trigger — `FinishGame*` / `ApplyEloAsync`), `GameResponseMapper` (the
  `GameResponse` wire shape + player profiles).
- **`RoomService`** — create/join a room, claim a seat.
- **`BoardMapper`** (`Mapping/BoardMapper.cs`) — the engine↔`Heliograph.Contracts` translation. Stays
  here rather than in `Heliograph.Contracts` because it needs `Heliograph.Engine`.
- **`EloService`** — pure-function rating math, kept to the same no-EF/no-DI discipline as the
  three BCL-only projects even though it lives here (see its own file for why it wasn't extracted).
- **Everything else orchestration-shaped:** `AuthService`, `FriendService`, `InviteService`,
  `AdminService`, `LeaderboardService`, `BotService`; controllers (`Controllers/*.cs`); the one hub
  (`Hubs/GameHub.cs`, `Hubs/GameConnectionTracker.cs`); `HeliographDbContext` + EF migrations; the
  transactional clock endpoints (`ClaimTimeoutAsync` in `GameService.Endings.cs`, and its sibling
  `ClaimAbandonmentAsync`).

### Consumers of the BCL-only projects

`Heliograph.Engine` → `GameEngine.ApplyMove`/`FireLaser`/`CheckWin`/`ValidateMove`/`LegalMoves` (called
from `GameService`/`BotService`), `RuleSets`/`BoardLayouts` (called from `GameService`/
controllers). `Heliograph.Clock` → `ClockMath` (via `GameClockLifecycle`), `TimeControls` (`GameService`,
`RoomService`, plus `ApplicationUser.BucketFor(TimeControlCategory)` making accounts/ratings a
consumer — `EloService`, `AuthService`, `LeaderboardService`). `Heliograph.Contracts` → every controller,
every service, `HeliographDbContext`, `GameHub`, `BoardMapper`, and the `Domain.Game`/`Domain.Move`
entities' `State`/`LaserResult` properties.


## Heliograph.Clock

### What's in here — and what isn't

**In here:** `ClockMath` (pure arithmetic — `HasExpired`, `AfterMove`, `NextDailyDeadline`) and the
`TimeControl` preset registry (`TimeControl`, `TimeControlCategory`, `TimeControls`,
`TimeControlCategories`, `UnknownTimeControlException`).

**Not here — the clock *lifecycle* lives in `Heliograph.Api`:** *when* the arithmetic is applied —
starting a clock (`InitializeClock`), banking a mover's time and setting the next deadline
(`UpdateClockAfterMove`), the pre-move expiry check (`PreMoveExpiry`) — is
`backend/api/Services/GameClockLifecycle.cs`, a pure `Game`-field mutator that takes `now` as a parameter
just like this project. The transactional parts — the authoritative `claim-timeout` endpoint
(`ClaimTimeoutAsync` in `backend/api/Services/GameService.Endings.cs`) and ending a game on timeout
(`FinishByTimeoutAsync` in `backend/api/Services/GameEndService.cs`) — are interwoven with EF transactions,
the `Game` entity, Elo, and SignalR broadcasts. This project is only the arithmetic those call
into — a task that changes clock *behaviour* (e.g. "increment applied on the first move", "add a
delay-style time control") will touch `GameClockLifecycle` too, not just this project.

### Consumers

Not only game code. `ApplicationUser.BucketFor(TimeControlCategory)` in
`backend/api/Domain/ApplicationUser.cs` makes accounts/ratings a consumer of `TimeControlCategory` — so
`EloService`, `AuthService`, and `LeaderboardService` reference this project as well as
`GameService` (and its `GameClockLifecycle` / `GameEndService` / `GameResponseMapper` collaborators),
`RoomService`, and `LeaderboardController`.


## Heliograph.Contracts

### What's in here — and what isn't

**In here** (~45 `public sealed record` types, seven files):
- `GameApi.cs` — the games / rooms / moves / leaderboard / move-history request+response bodies
  (`GameResponse`, `SubmitMoveRequest`/`SubmitMoveResponse`, `RoomResponse`, the resign/rematch
  request+response pairs, `MoveError`, `GameSummary`, `MoveHistoryResponse`, …).
- `DiagnosticsApi.cs` — the bug-report capture bodies (`BugReportRequest`/`BugReportAck`) and the
  `/api/admin/bug-reports*` admin shapes (`AdminBugReportRow`/`AdminBugReportListResponse`/
  `AdminBugReportDetail`). `BugReportRequest.Bundle`/`AdminBugReportDetail.Bundle` are the one
  deliberate exception to "enum-valued fields are strings" below — they're opaque `JsonElement`,
  never deserialized into a domain type (see `Heliograph.Api.Domain.BugReport`'s doc comment).
- `BotDifficulty.cs` — `BotDifficulty`/`BotDifficulties`/`UnknownDifficultyException`, the named
  bot-difficulty registry (`Easy`/`Medium`/`Hard`). Same static-registry `For`/`IsKnown` shape as
  `Heliograph.Engine.RuleSets`/`BoardLayouts`, but lives here rather than `Heliograph.Engine` because it names a
  `Heliograph.Api` bot strategy (`BotService.ChooseMove`'s search depth/behavior), not an engine rule.
- `AuthApi.cs` — `RegisterRequest`/`LoginRequest`/`RefreshRequest`, `AuthResponse`, `UserProfile`,
  `PatchMeRequest`, `RatingBucket`, `AuthError`.
- `FriendsApi.cs` — `UserSearchResult`, `FriendRequestCreate`/`FriendRequestCreateResponse`,
  `FriendSummary`, `FriendRequestSummary` — the `/api/users/search` and `/api/friends*` bodies.
- `BoardState.cs` — `CoordDto`, `BoardPiece`, `BoardState`. **`BoardState` is also the shape stored
  in the `Game.State` jsonb column**, not just an API payload — there is deliberately one
  representation.
- `LaserResult.cs` — `LaserResultSegment`, `EmitterInfo`, `EliminatedPiece`, `DamagedPiece`,
  `LaserResult`. **`LaserResult` is also the `Move.LaserResult` jsonb column.**

**Not here:**
- **`BoardMapper`** (engine↔contract translation) stays in `backend/api/Mapping/` — it needs `Heliograph.Engine`,
  which this project must never reference. `Domain.Game` / `Domain.Move` (the EF entities that carry
  `BoardState` / `LaserResult`) stay in `backend/api/Domain/`.
- The EF jsonb converters/comparers (`JsonbConverter`, `HeliographJson`) stay in `backend/api/Persistence/`.

### Consumers

Every controller, every service, `HeliographDbContext`, `GameHub`, `BoardMapper`, and the `Domain.Game` /
`Domain.Move` entities (their `State` / `LaserResult` properties). `api.tests` references this
project explicitly.


## Heliograph.Engine

### Public surface

Default to `internal`. `InternalsVisibleTo` is granted to `Heliograph.Engine.Tests` only — `Heliograph.Api`
cannot see internals, so anything `Heliograph.Api` calls must be `public`. Currently public, and why:

| Type(s) | Why public |
|---|---|
| `Board`, `PieceOnBoard`, `Coord` | `Heliograph.Api`'s `BoardMapper` constructs / reads them directly |
| `Board.Create` | `BoardMapper.ToBoard` builds boards directly; `Heliograph.Api` can't use an `internal` |
| `EngineMove` + `Shift` / `Turn` / `Stack` / `Unstack` | constructed by `BoardMapper.ToEngineMove` |
| `RuleSet`, `RuleSets`, `UnknownRuleSetException` | `RuleSets.For(...)` called in `GameService` / controllers; exception caught by type |
| `BoardLayout` (incl. `.Name`), `BoardLayouts`, `UnknownBoardLayoutException` | same shape as `RuleSet` |
| `PlacedPiece` | element type of the public `BoardLayout.Pieces` — C# accessibility forces it public; no `Heliograph.Api` code reads it today |
| `GameEngine` (`ApplyMove` / `FireLaser` / `CheckWin` / `ValidateMove` / `LegalMoves`), `MoveValidation` | called by `GameService` / `BotService` |
| `LaserOutcome`, `LaserSegment`, `LaserDamage` | read via `BoardMapper.ToLaserResult` |
| the 9 enums in `Heliograph.Engine.Enums` | used across `Heliograph.Api` (`Domain`, `Hubs`, `Mapping`) |
| `LaserReflection` | **internal** — only `GameEngine` and its test use it; keep it that way |

Namespaces follow the folder: files at the project root are `Heliograph.Engine`, files under `Enums/` are
`Heliograph.Engine.Enums`.


## Repo-wide (from the root CLAUDE.md)

### Backend projects — which one to open

`Heliograph.slnx` has four production projects. Start a task in the narrowest one that covers it; each
extracted project has its own `CLAUDE.md`.

| Project | What it is | Tasks that live here |
|---|---|---|
| `Heliograph.Engine` | Pure laser-chess rules (BCL only). See `backend/Heliograph.Engine/CLAUDE.md`. | move legality, laser trace, win detection, board layouts, rule variants |
| `Heliograph.Clock` | Pure clock arithmetic + time-control presets (BCL only). See `backend/Heliograph.Clock/CLAUDE.md`. | clock formulas, a new time-control preset — **not** clock scheduling/flagging, which is in `Heliograph.Api` |
| `Heliograph.Contracts` | Wire/DTO records + the shared board/laser jsonb shapes (BCL only). See `backend/Heliograph.Contracts/CLAUDE.md`. | adding or changing an API request/response field; the `BoardState` / `LaserResult` shape (which is also the `Game.State` / `Move.LaserResult` column) |
| `Heliograph.Api` | **Fallback — if a task isn't covered by a row above, it's here.** The Web API, EF/Postgres, SignalR, Identity, and all orchestration. See `backend/api/CLAUDE.md` for what lives here and its own invariants (DI lifetimes, the claim pattern, REST-vs-hub, additive columns, null-carries-meaning). | |

### Three layers of testing — know which one you're actually running

Don't stand up a local Postgres as a matter of routine before opening a PR — that duplicates a
layer that already exists and just adds friction. The three layers are deliberately
non-overlapping:

1. **Local / pre-PR (you, right now): unit + component tests only.** Run `dotnet test
   backend/Heliograph.slnx` with **no** `HELIOGRAPH_TEST_DB` set, and `npm run lint && npm run test && npm run
   build` from `/web`. The `[Trait("Category","Integration")]` tests in `backend/api.tests/Api/`
   will **skip, not fail** — that is the expected, sufficient result now, not a gap to fill. No
   Docker/Postgres needed locally.
   Also: **never attempt to reach the maintainer's own dev database (`<db-host>`)** from an agent
   environment — it's a private address, unreachable from a sandbox or cloud run, and a
   "connection refused" there is expected, not a bug to chase.
2. **CI (`.github/workflows/ci.yml`): the authoritative DB-backed gate.** It runs a real
   `postgres:16` service container, so `Integration`-tagged tests actually execute there. This is
   the one place DB-backed correctness gets verified — trust it rather than re-verifying locally.
   If you're specifically debugging a DB-related failure (not routine pre-PR verification), the
   `heliograph-test-db` skill stands up the same throwaway Postgres CI uses.
3. **Manual / live (the owner, on the deployed app):** anything only visible under real
   timing/multi-client conditions (SignalR races, turn-state desync) isn't caught by 1 or 2. It
   surfaces from actually playing the deployed app, and gets diagnosed from the deployed api
   container's persisted Serilog file log — see `GOTCHAS.md`'s "Retrieving the deployed api's log
   file" entry for the retrieval convention — and/or the DB-backed in-app bug-report feature
   (`docs/backlog/10-bug-traceability.md`), which captures client-side state a server log
   structurally can't.
