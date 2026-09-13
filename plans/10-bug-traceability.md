---
feature: bug-traceability
status: ready
depends_on: []
backend_branch: feat/bug-traceability-be
frontend_branch: feat/bug-traceability-fe
---

# Bug traceability: correlation IDs + in-app bug report capture

## Context

Manual playtesting keeps surfacing hard-to-reproduce multiplayer bugs (most recently: both
players' clients simultaneously showed the opponent as having the current turn — mutually
exclusive states that shouldn't both be true). Diagnosing these today depends on the playtester
verbally describing what they saw after the fact, which loses exact timing, payloads, and
reconnect/network context. This plan makes that class of bug self-diagnosing: a correlation id
threaded through one game action's full lifecycle (REST request → server log → SignalR broadcast),
a client-side ring buffer of recent events, and a low-friction "Report a bug" button that bundles
both into a stored, queryable record — without adding a heavyweight observability stack or any
hub-side mutation.

## Wire contract

### `POST /api/games/{id}/bug-reports`

New action on `GamesController` (inherits its class-level `[Authorize]` — signed-in users only,
matching the class doc comment's "guest play is gone" note). `id` (route) is the authoritative
`GameId`; it is never taken from the body.

- `[RequestSizeLimit(262_144)]` (256 KB) — the only anti-abuse control, since retention is manual
  (see Owner decisions). Oversize body → framework `413`.
- Request body, new `Khet.Contracts` record:
  ```csharp
  public sealed record BugReportRequest(
      string? Seat,              // "P1" | "P2" | "Spectator" | null
      string? ConnectionId,      // current SignalR connectionId, null if hub not connected
      int MoveCount,
      string? Turn,
      string? Status,
      long? ServerOffsetMs,
      string? LastTraceId,       // TraceId of the last move/ending this client observed
      DateTime ClientCapturedAtUtc,
      JsonElement Bundle);       // opaque: ring buffer + last moveApplied payload
  ```
- Response: `201` with `BugReportAck(Guid Id, DateTime ReceivedAtUtc)`.
- Errors: `404` (`MoveError`, "no game with id {id}") if the game doesn't exist; `401` anonymous;
  `413` oversize.
- **Explicitly does not broadcast anything over `GameHub`** — write-and-store only, no other client
  needs to know a bug report was filed.

### Admin read/delete — extend `AdminController`/`AdminService`

- `GET /api/admin/bug-reports?gameId={guid?}&page=1&pageSize=25` → `AdminBugReportListResponse
  (IReadOnlyList<AdminBugReportRow> Reports, int Total, int Page, int PageSize)`, same
  `NormalizePaging`/`AsNoTracking` idiom as `AdminService.ListGamesAsync`. `AdminBugReportRow` is a
  summary (no `Bundle`): `Guid Id, Guid? GameId, Guid? UserId, string? UserDisplayName, string?
  Seat, int MoveCount, DateTime ClientCapturedAtUtc, DateTime ReceivedAtUtc`.
- `GET /api/admin/bug-reports/{id}` → `AdminBugReportDetail` (all of the row's fields plus
  `JsonElement Bundle`, `ConnectionId`, `Turn`, `Status`, `ServerOffsetMs`, `LastTraceId`). `404`
  (`AdminError`) if unknown, mirroring `GetUser`.
- `DELETE /api/admin/bug-reports/{id}` → `204`, or `404` (`AdminError`) if unknown, mirroring
  `DeleteUser`.
- Add all three routes to `AdminEndpointIntegrationTests`'s existing
  `Admin_routes_reject_anonymous_and_non_admin_callers` theory so the auth gate is asserted for
  free.

### Correlation IDs

Two keys, not one — they cover different halves of the lifecycle:

- **`X-Trace-Id` header** — client-generated (`crypto.randomUUID()`), attached by `authFetch` to
  every REST call, optional/server-generated-as-fallback if absent (`TraceIdFromRequest()` helper
  on the controller: use the header if present, else `Guid.NewGuid()`) so a request is never
  rejected for lacking it. This is the primary key for anything with an HTTP request behind it.
- **`connectionId` + `gameId` + `seat`** — for hub-only events with no HTTP request (`Join`,
  `OnDisconnectedAsync`, etc).
- `moveCount` is a secondary log-scope field only, never the identity key — the bug being chased is
  precisely two clients disagreeing about move/turn state, so a key derived from that disputed
  state can't reliably identify the thread.

`TraceId` is added as a trailing nullable field **only** to the two records that are broadcast over
the hub, not just returned to the submitter:
- `SubmitMoveResponse` (`Khet.Contracts/GameApi.cs:116`) — add `string? TraceId = null`.
- `GameEndedResponse` (`:142`, currently `(string Status, string EndReason, DateTime
  ServerNowUtc)`) — add `string? TraceId = null` as a 4th positional field.

Do **not** touch `ClaimTimeoutResponse`/`ClaimAbandonmentResponse`/`ResignResponse` — those are
REST-response-only bodies returned to the submitter (who already generated the trace id); the
`GameEndedResponse` each of those three actions also constructs and broadcasts is what carries the
id to the *other* client.

**Mandatory same-PR mirror update** (`Khet.Contracts/CLAUDE.md`'s wire-shape rule): `web/src/api/
types.ts`'s `SubmitMoveResponse` and `GameEndedEvent` interfaces both gain `traceId: string | null`.

## Backend scope

- **`Khet.Contracts/GameApi.cs`**: add `TraceId` to `SubmitMoveResponse` and `GameEndedResponse` as
  described above (trailing, defaulted — compiles unchanged against every existing positional
  construction site).
- **New `Khet.Contracts/DiagnosticsApi.cs`**: `BugReportRequest`, `BugReportAck`,
  `AdminBugReportRow`, `AdminBugReportListResponse`, `AdminBugReportDetail`.
- **New `api/Domain/BugReport.cs`** entity — `Id`, `GameId` (nullable), `UserId` (nullable),
  `Seat`, `ConnectionId`, `MoveCount`, `Turn`, `Status`, `ServerOffsetMs`, `LastTraceId`,
  `ClientCapturedAtUtc`, `ReceivedAtUtc`, and `BundleJson` (`string`, `.HasColumnType("jsonb")`,
  storing `request.Bundle.GetRawText()`). **Deliberately no `JsonbConverter<T>`/typed shape** — see
  Owner decisions.
- **`api/Data/KhetDbContext.cs`**: `DbSet<BugReport> BugReports`; `OnModelCreating` config —
  `HasIndex(r => r.GameId)`, `HasIndex(r => r.ReceivedAtUtc)`, and both FKs
  (`GameId`→`Games`, `UserId`→`ApplicationUser`) as `OnDelete(DeleteBehavior.SetNull)` — a report
  explaining why a game or account broke should survive that game/account being deleted, matching
  `Game.P1UserId`/`MatchInvite.GameId`'s existing nullable-FK precedent.
- **New migration** `AddBugReports` via `dotnet ef migrations add AddBugReports` — a genuine new
  table, the explicit exception to this repo's "additive columns, not new tables" convention (see
  Owner decisions for why).
- **`GamesController.cs`**: inject `ILogger<GamesController> logger` into the primary constructor
  (currently none). Add `ReportBug(Guid id, BugReportRequest request, CancellationToken ct)` at
  `POST {id}/bug-reports` per the Wire contract — checks `games.GameExistsAsync(id, ct)` (new
  trivial method), calls `games.SaveBugReportAsync(id, this.CurrentUserId(), request, ct)`, logs
  one `LogInformation` line, returns `StatusCode(201, new BugReportAck(...))`.
  - At the four existing broadcast sites (`SubmitMove` ~:146, `ClaimTimeout` ~:190, `ClaimAbandonment`
    ~:218, `Resign` ~:244): read/generate the trace id via `TraceIdFromRequest()`, stamp it onto the
    response/broadcast object with a `with` expression (e.g. `result.Response with { TraceId =
    traceId }`) before both returning it and passing it to `hub.Clients.Group(...).SendAsync(...)`,
    and add one `LogInformation` call per action with `{GameId} {TraceId} ...` fields.
  - **No `GameService` signature changes for trace-id threading** — the controller is the only
    place with `HttpContext`/the header, so it stamps the already-built record post-hoc via `with`
    rather than threading a `string traceId` parameter through five `GameService` methods that
    otherwise return the record unmodified.
  - Wrap each `games.*Async(...)` call in `using var scope = logger.BeginScope(new
    Dictionary<string, object?> { ["TraceId"] = traceId, ["GameId"] = id })` — `ILogger<T>`'s scope
    provider is shared per-factory, so a scope opened against `ILogger<GamesController>` also
    enriches lines logged via the separately-injected `ILogger<GameService>` during that call, with
    no parameter threading.
- **`GameService.cs` + partials**: inject `ILogger<GameService>` into the primary constructor
  (currently none — this is net-new logging, not enrichment of existing calls, since none of
  `GameService`'s partials currently log anything). Add `LogInformation` lines: in
  `SubmitMoveAsync` after a move applies and on `PreMoveExpiry` rejection
  (`GameService.SubmitMove.cs`); on each ending's success path (`GameService.Endings.cs`); on
  mark/clear-disconnected (`GameService.Disconnect.cs`); when the bot actually plays
  (`GameService.Bot.cs`). New `GameExistsAsync(Guid, CancellationToken)` and
  `SaveBugReportAsync(Guid gameId, Guid? userId, BugReportRequest request, CancellationToken ct)` —
  put both in a new `GameService.Diagnostics.cs` partial (one concern per partial, matching the
  existing split).
- **`api/appsettings.json`**: add `"Logging": { "Console": { "IncludeScopes": true, "FormatterName":
  "json" } }` alongside the existing `LogLevel` block — without `IncludeScopes`, `TraceId`/`GameId`
  never surface in log output despite everything compiling; the JSON formatter is what makes the
  correlation fields actually grep-able as structured fields rather than indented text.
- **`api/Controllers/AdminController.cs`** + **`api/Services/AdminService.cs`**: add the three
  routes/methods per the Wire contract, following `ListGamesAsync`'s pagination/projection idiom
  and `GetUser`/`DeleteUser`'s 404 idiom exactly.
- No new DI registrations beyond the two `ILogger<T>` — resolved automatically via the existing
  `AddLogging`.

## Frontend scope

- **`web/src/api/types.ts`**: add `traceId: string | null` to `SubmitMoveResponse` and
  `GameEndedEvent`.
- **New `web/src/diagnostics.ts`** (flat file, same convention as `realtime.ts`/`store.ts` — not a
  new folder): a `RING_SIZE = 200` ring buffer of `{ kind: 'action' | 'hub' | 'rest', label,
  timestamp, detail? }` entries — `pushRingEntry`, `getRingBuffer()` (returns a copy, never the
  live array), `resetRingBuffer()` (test-only). **Dependency-free by design** (no import of
  `store.ts`/`realtime.ts`/`authFetch.ts`) to avoid a cycle, since all three of those import *into*
  it.
- **`web/src/api/authFetch.ts`**: mint `crypto.randomUUID()` per call, attach as `X-Trace-Id`
  header, push one `pushRingEntry({ kind: 'rest', ... })` per actual fetch attempt — meaning
  **two** entries (same trace id) on a 401-then-retry, not one, so a retried call doesn't read as a
  duplicate submit in the reconstructed log.
- **`web/src/realtime.ts`**: add a `pushRingEntry` call alongside each existing
  `console.log('[realtime] ...')` at the lifecycle/event handlers (`moveApplied`, `gameEnded`,
  `opponentDisconnected`, `opponentReconnected`, `opponentJoined`, connect/reconnect/close) —
  existing `console.log`s stay untouched. Add `export function getConnectionId(): string | null`
  reading the existing module-level `connection` singleton, modeled on the existing `isConnected()`
  export.
- **`web/src/store.ts`**: wrap only the methods on the disputed turn/state path — the private
  `submit()` helper (`:331`, covers all four turn actions), `applyRemoteMove`, `applyGameEnded`,
  `resync`, `reconnectRealtime` — not all ~15 public actions. Keep a `lastMoveApplied:
  SubmitMoveResponse | null` field (set in `applyRemoteMove`) so the bug bundle can attach the full
  last payload without re-deriving it from summarized ring entries.
- **New `web/src/api/reportBug.ts`** (own file, matching `adminClient.ts`'s precedent of a
  distinct, low-frequency action getting its own module rather than folding into `client.ts`):
  `reportBug(gameId, body): Promise<{ id, receivedAtUtc }>` via `authFetch`, following the same
  `ApiError`-on-`!res.ok` idiom as every other `client.ts` function.
- **New `web/src/components/BugReportDialog.tsx`**: modeled on `SettingsDialog.tsx`'s composition
  (`ui/Dialog.tsx`). On open, assembles the bundle from a one-shot `useGame.getState()` read (never
  a reactive subscription) + `getRingBuffer()` + `getConnectionId()`, then calls `reportBug`.
  **Never imports or reads `useAuth`/any token** — not even to redact it, so there's no code path
  that could serialize one.
- **`web/src/layout/AppLayout.tsx`**: add `bugReportOpen` boolean state beside the existing
  `settingsOpen` (`:49`), render a small persistent trigger button in the header next to the
  existing settings-gear button (same row — not `RoomStatusBar`, which returns `null` outside a
  room), gated to only render while `useGame((s) => s.gameId) !== null` (in-game only, per the
  chosen trigger placement). Render `<BugReportDialog>` beside `<SettingsDialog>` (`:133`).

## Tests

Backend (`IntegrationFixture`, `[Trait("Category","Integration")]`, skip-if-no-Postgres per house
convention):
- New `api.tests/Api/BugReportIntegrationTests.cs`: `201` + row persisted with correct
  `GameId`/`UserId` on a valid game; `404` unknown game; `401` anonymous; `413` oversize bundle;
  `GameId` survives game deletion as `null` (`SetNull` FK behavior).
- Extend `api.tests/Api/AdminEndpointIntegrationTests.cs`: list (filtered/paginated), detail
  (200/404), delete (204 then 404 on repeat); add the three new routes to the existing
  `Admin_routes_reject_anonymous_and_non_admin_callers` theory.
- Extend the existing hub integration test(s) that already assert broadcast payload shape (e.g.
  `GameEndedHubIntegrationTests.cs`) to assert `TraceId` set via `X-Trace-Id` on the REST call
  arrives unchanged in the `moveApplied`/`gameEnded` broadcast — this is the end-to-end proof of
  requirement 1.

Frontend (Vitest, matching existing colocated `*.test.ts(x)` convention):
- New `web/src/diagnostics.test.ts`: eviction at 200 entries, `getRingBuffer()` returns a copy,
  `resetRingBuffer()`.
- Extend `web/src/api/authFetch.test.ts`: `X-Trace-Id` header present and UUID-shaped; a 401-retry
  produces two ring entries sharing one trace id.
- New `web/src/api/reportBug.test.ts`: correct URL/body, `ApiError` on non-ok response — mirror
  `adminClient.test.ts`'s pattern.
- New `web/src/components/BugReportDialog.test.tsx`: submitted bundle contains no key matching
  `accessToken`/`refreshToken`/`token` (regression guard for the "never include auth" rule) and
  does contain `gameId`/`seat`/`moveCount`.

## Out of scope

- Any admin-facing frontend page to browse reports — the three admin routes are curl/psql-only in
  this plan; a `pages/admin/BugReportsPage.tsx` is a natural, cheap follow-up but not built here.
- Mechanically pairing two players' reports of the same incident — correlated after the fact by
  `gameId` + timestamp proximity + a shared `LastTraceId` when present; no linking table, no
  server-side matching.
- A guest opponent cannot file a bundle (endpoint requires auth, per Owner decisions) — a two-sided
  capture requires both players to be signed in; this is an accepted limitation, not a bug.
- Automatic retention/pruning/age-based cleanup — single-id `DELETE` only, no cron/worker, no
  count-based eviction of old rows.
- Server-side redaction/scrubbing of the bundle — the client is solely responsible for never
  including the auth store; the server stores the `JsonElement` verbatim.
- Reproducing/replaying a captured bundle against the engine mirror — capture-and-store only.
- A free-text "what happened" field on the report — not required by the bundle contents below; a
  trivial addition later if wanted, not a scope change now.

## Owner decisions already made

- Trigger UX: a small persistent button in the game's header chrome, visible only during an active
  game — not a keyboard shortcut, not buried in the settings menu.
- Retention: manual only. A single-id admin `DELETE` endpoint, no automatic cap or age-based
  cleanup — consistent with this repo's "no background timer/worker" claim-pattern convention.
- Report access: a simple admin list/detail/delete API (`/api/admin/bug-reports*`), no admin
  frontend page in this plan.
- Auth: signed-in users only — the endpoint inherits `GamesController`'s existing class-level
  `[Authorize]`. Both players can independently trigger a report for the same incident; they are
  not paired mechanically (see Out of scope).
- Ring buffer size fixed at 200 entries; server log level `LogInformation` — tunable constants, not
  product negotiations.
- The stored bundle is opaque JSON (plain `string`/jsonb column, no `JsonbConverter<T>`) — unlike
  `Game.State`/`Move.LaserResult`, this is deliberately **not** a Contracts wire/jsonb-shared shape,
  since nothing ever deserializes it back into a domain type and typing it would make every
  ring-buffer field addition touch `Khet.Contracts`.
- A new `BugReports` table is a deliberate, explicit exception to "additive columns, not new
  tables" — this data isn't a variant of an existing row, it's an independent append-only log.
- Trace-id threading uses `logger.BeginScope` + record `with`-expressions at the controller, not
  new `GameService` parameters — `GameService` has no `HttpContext` today and stays that way;
  requires `appsettings.json`'s `Logging.Console.IncludeScopes`/`FormatterName: "json"` to actually
  surface fields in output.

## If blocked

Edit this file's frontmatter to `status: blocked` plus a one-line `blocker:` if something genuinely
ambiguous comes up that isn't covered above; stop without opening a PR. Ordinary implementation
judgment calls are yours — don't block on those.
