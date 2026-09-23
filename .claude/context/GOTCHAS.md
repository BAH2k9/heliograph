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
`backend/Heliograph.Engine.Tests/LaserReflectionFrameTests.cs:43`. The reflection lookup has a known entry-side subtlety; a failure in these
tests almost always means new code is reading the table wrong, not that the table is wrong.
Flipping the lookup to make the test pass "flips the bug back in" (the test file's own words).

### The client mirrors engine rules — the server is still the only referee
`web/src/game/rules.ts`, `board.ts`, `laser.ts`, `coords.ts`, `inferMove.ts` are a hand-written
copy of `Heliograph.Engine` used only for highlighting / snap-back / optimistic animation. On any
disagreement the server wins silently (`web/src/game/board.ts:125`, `matchesServer`). A rule change
in `Heliograph.Engine` must move the mirror (and its `game/*.test.ts`) in the same PR. See
`web/CLAUDE.md`.

### DI lifetime of the game-flow services must stay `Scoped`
`GameService` and its collaborators (`GameEndService`, `GameClockLifecycle`, `GameResponseMapper`,
`RoomService`) share one per-request `HeliographDbContext`, and that shared context is what makes
single-transaction atomicity real. A `Singleton` / `Transient`-with-its-own-context
mis-registration breaks atomicity **with every behavioural test still green**. Guarded by
`backend/api.tests/Services/ServiceRegistrationTests.cs`; `backend/api/Program.cs:45-56` and the two service doc
comments say "do not change the lifetime". Believe them.

### An artificial `Task.Delay` must not run against the injected `TimeProvider`
`backend/api/Services/BotService.cs`'s bot "thinking" pause and `backend/api/Services/GameService.SubmitMove.cs`'s
call site use a real wall-clock `Task.Delay(TimeSpan)`, deliberately *not* `Task.Delay(TimeSpan,
TimeProvider)` against the `TimeProvider` `GameService` already takes. `IntegrationFixture` swaps in
a `FakeTimeProvider` that only advances when a test explicitly calls `SetUtcNow` — a delay scheduled
against it would simply never complete, hanging the request forever. `BotService` has its own
test-only override seam (`ThinkingDelayOverrideForTests`, same shape as
`Domain.DiscriminatorAssigner.CandidateOverrideForTests`) for tests that don't want to eat the real
0.5-1.5s wait either.

### One captured `now` per request
Inside `SubmitMoveAsync` every clock decision reads a single `now = Now()` captured up front; a
second `time.GetUtcNow()` / `DateTime.UtcNow` later in the method is a timing-semantics change that
**no test catches** (`backend/api/Services/GameService.SubmitMove.cs`, and `GameClockLifecycle`'s doc
comment). Conversely `RoomService.JoinRoomAsync` deliberately captures `now` *immediately before*
`InitializeClock` rather than hoisting it — hoisting shifts `TurnStartedAtUtc` / `TurnDeadlineUtc`
by the query latency (noted in commit `33494ec`).

### `<see cref>` doc references are not compiler-checked
The API project has no `GenerateDocumentationFile`, so `<see cref="...">` in doc comments can rot
silently — a rename won't break the build. Commit `33494ec` had to repoint two that pointed at
methods which had moved. If you move a method, grep for its name in doc comments.

### A local `dotnet test backend/Heliograph.slnx` skipping the integration tests is expected, not a gap
The `[Trait("Category","Integration")]` tests in `backend/api.tests/Api/` **skip, not fail**, when no
Postgres is reachable (`Skip.If(fixture.UnavailableReason is not null, ...)`). This used to mean
"spin up a throwaway Postgres locally before trusting a PR" — it no longer does. Per the root
`CLAUDE.md` three-layer testing model, local/pre-PR runs are unit+component only by design (no
Docker/Postgres needed), and `.github/workflows/ci.yml`'s own Postgres service container is the
one place `Integration` tests are meant to actually execute. Don't read a local skip-only run as
incomplete, and don't use `khet-test-db` as a routine pre-PR step anymore — it's for when you're
specifically debugging a DB-related failure.

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
as "logged out for no reason" on iOS, that's the known tradeoff from `docs/backlog/05-pwa.md`, not a fetch
or token-refresh bug.

### Retrieving the deployed api's log file — `pve` → `pct enter 107`, read-only, nothing else
`infra/docker-compose.yml` bind-mounts the `api` container's `/app/logs` to `/opt/khet/logs` on the host
(CT107) instead of a named volume, specifically so the Serilog rolling file
(`khet-api-<date>.log`, see `backend/api/appsettings.json`'s `Serilog.WriteTo` File sink) is readable as a
plain file with no `docker exec`/`docker cp`/docker-group access needed. The sanctioned way to read
it: `ssh pve` (the Proxmox host, not CT107 directly) then `pct enter 107` to land inside the
container, then e.g. `tail -n 2000 /opt/khet/logs/khet-api-*.log`. This is a **behavioral**
restriction, not a technical one — `pct enter` from `pve` is a full root shell inside CT107, a
deliberate trade of least-privilege for reusing existing access rather than provisioning a new
scoped key. Use this path *only* to read that log file. Never run a deploy, edit config, or take
any other action inside CT107 through it — that's `ssh khet && ./deploy.sh` (see `infra/deploy.sh`),
a separate, already-established convention.

### `192.168.0.20` "connection refused" after a reboot / network change — check ARP first
Carried over from the old infra notes. Windows once cached a stale ARP entry mapping `.20` (the DB
host on the home LAN) to a device that previously held that DHCP lease, and DBeaver/Npgsql got
refused while Postgres was perfectly healthy. If it recurs, as admin:
`Remove-NetNeighbor -IPAddress 192.168.0.20 -Confirm:$false`. Shouldn't happen under normal use
(the container has a fixed IP and `onboot: 1`), but it's not a code or Postgres fault when it does.
Irrelevant to cloud/sandbox agents, which can't reach that LAN address anyway.

### `user:{id}` SignalR group name is stringly-typed in two files, and `Clients.User()` doesn't work here
`backend/api/Hubs/GameHub.cs` (`SubscribeToUser`) builds `$"user:{userId}"` from the JWT's own `sub` claim;
`backend/api/Controllers/InvitesController.cs` (`Create`) independently builds the same string from
`request.InviteeUserId`. No shared constant ties them together — a typo'd prefix in one file breaks
delivery with no error anywhere (the broadcast just lands on an empty group). Don't reach for
SignalR's built-in `Clients.User(id)` "fix" here either: `Program.cs` sets `MapInboundClaims = false`
and issues `sub`, not the `ClaimTypes.NameIdentifier` SignalR's default `IUserIdProvider` reads, so
`Clients.User()` would silently deliver to nobody. `backend/api.tests/Api/InviteHubIntegrationTests.cs`
covers that the two strings agree today; re-run it after touching either file.

### A bot-game move that stays inside one call bunches both plies' broadcasts together
The first cut of the bot-opponent feature computed the human's move *and* the bot's reply
(including its artificial "thinking" delay) inside one `GameService.SubmitMoveAsync` call, only
broadcasting `moveApplied` for both at the very end. That made the delay invisible — the client's
`submit()` awaited the whole request before releasing its `busy` flag, so even the human's own
hub-pushed move sat queued behind the delay (`applyRemoteMove` in `web/src/store.ts` won't apply a
push while `busy`), and both plies landed as one instant jump the moment the request finally
resolved. Fixed by splitting the bot's reply into its own method
(`GameService.PlayBotReplyIfDueAsync`, `backend/api/Services/GameService.SubmitMove.cs`) that
`GamesController.SubmitMove` (`backend/api/Controllers/GamesController.cs`) calls *after* broadcasting the
human move's own `moveApplied` — plus not holding `busy` across the whole POST in a bot game's
`submit()` (`web/src/store.ts`). If a future change re-bundles per-ply server work into one call
before broadcasting any of it, re-check this exact interaction: broadcast timing on the server and
client-side `busy` gating both have to agree, or multi-step server responses silently collapse on
the client no matter how well-paced the server side looks in isolation.

### The web/api split has no CORS policy — it relies on staying same-origin behind Caddy
`backend/api/Program.cs` registers no `AddCors`/`UseCors` anywhere, and there's no cookie auth to leak
cross-site anyway (JWT-only, tokens in `localStorage`). This works today only because `infra/Caddyfile`
puts `web` and `api` behind one origin (`/api/*` → `api:8080`, everything else → `web:80`). The
planned Cloudflare Tunnel setup (`docs/scoping/cloudflare-tunnel.md`) must keep pointing at that
single Caddy origin with one public hostname. If a future change splits the tunnel ingress into
separate hostnames for web vs. api, requests will start failing with no server-side error until an
explicit CORS policy is added.

### The hub's client retry policy is coupled to the server's abandonment grace
`hubRetryPolicy` (`web/src/realtime.ts:104-113`) retries **forever** — instantly, then every 3s
through a 60s dense window, then every 30s — and that shape is not a taste call. A successful
`Join` clears the server's disconnect timestamp, so reconnecting is what defuses an opponent's
abandonment claim, and `AbandonmentGraceSeconds = 45` (`backend/api/Services/GameService.Endings.cs:23`)
is the deadline. Shortening the dense window below the grace, or making the tail finite again,
silently reintroduces "lost a live game to a 50-second tunnel blip". SignalR's own
`withAutomaticReconnect()` default (`[0, 2s, 10s, 30s]`, then stop forever) is exactly that bug —
it landed 4 attempts inside the window and then gave up permanently. The `hubRetryPolicy` tests in
`web/src/realtime.test.ts` guard both halves; if you change `AbandonmentGraceSeconds`, re-read
them rather than just re-running them.

Related, same file: server-side SignalR group membership belongs to a *connection*, so it survives
neither an automatic reconnect nor a rebuild. Any code path that produces a live connection must go
through `reestablishSubscriptions` (`web/src/realtime.ts`) — re-`SubscribeToUser`, re-`Join` the
followed game, and fire `onReconnected` so the store resyncs. A path that skips it looks connected
and silently receives nothing, with REST still working the whole time.

### The login limiter's client IP comes from Caddy's `header_up`, not from `trusted_proxies` alone
`backend/api/Program.cs`'s `AddRateLimiter` partitions `POST /api/auth/login` on
`HttpContext.Connection.RemoteIpAddress`, which `UseForwardedHeaders` rewrites from the rightmost
`X-Forwarded-For` entry (`ForwardLimit` defaults to 1). Behind the Cloudflare Tunnel, Caddy's peer
is `cloudflared` for *every* public request — so if that rightmost entry is the peer, the whole
internet shares one bucket and a single guesser locks every real user out of logging in.

The obvious fix doesn't work on its own. Caddy's global `trusted_proxies` + `client_ip_headers
CF-Connecting-IP` only change Caddy's own `{client_ip}`; `reverse_proxy` still *appends the peer
address* to `X-Forwarded-For` (verified against Caddy 2.11.4: a trusted peer sending
`CF-Connecting-IP: 203.0.113.10` produced `X-Forwarded-For: <inbound chain>, <peer>` upstream). What
makes it work is `infra/Caddyfile`'s `header_up X-Forwarded-For {client_ip}` on the `/api` proxy,
which **replaces** the header with the resolved client — `CF-Connecting-IP` when the peer is
`cloudflared`'s reserved address (`172.30.53.2` on the `edge` network, `infra/docker-compose.yml`),
the peer itself otherwise. Remove that line and the collapse comes back silently.

Two corollaries:
- The API must **never** read `CF-Connecting-IP` itself. Caddy passes the header through from any
  peer, so a LAN caller can set it; only Caddy's trust check makes it meaningful. Pinned by
  `AuthEndpointIntegrationTests.Login_rate_limit_ignores_a_forged_cf_connecting_ip`.
- `172.30.53.2` is reserved: `edge`'s `ip_range` keeps dynamic allocation on `.8–.15`. The
  `cloudflared` service must be given exactly that `ipv4_address`, or its requests become
  untrusted and every tunnel caller is the peer again.

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

