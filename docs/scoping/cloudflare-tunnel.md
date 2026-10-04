# Scope: expose Heliograph publicly via Cloudflare Tunnel

Status: **scoped and decided; no infra built yet.** This is infra/homelab work, not a code feature
— there's no `docs/backlog/*.md` for it and there won't be one. This doc exists so the small set of
in-repo changes it implies (and the constraints it depends on) are recorded somewhere durable, per
the `docs/scoping/` convention.

## Where this stands (2026-09-14)

Read this first if you're picking the work up cold.

**Done:**
- Scoped, with the owner decisions below locked (no port-forwarding, dedicated `cloudflared` LXC,
  one public hostname at Caddy's `:80`).
- Reviewed against the actual code on 2026-09-14. That review rewrote the security triage under
  "What should change": Cloudflare Access in front of the admin surface and a rate limit on
  `POST /api/auth/login` were originally filed as future work, which was wrong — both are go-live
  items. It also added the anonymous-surface enumeration, the `infra/Caddyfile` `trusted_proxies` gap,
  and the PWA section.
- Two of the review's findings are now closed in code, ahead of the tunnel: `GET /api/leaderboard`
  is `[Authorize]`d (it was the one anonymous read), and `POST /api/auth/login` carries an in-app
  per-IP rate limit. Both have caveats — see the two bullets under "What should change".
- One code fix the review surfaced is merged: the hub's reconnect policy used to give up ~3s
  inside the server's 45s abandonment grace, which LAN hid and the tunnel would have exposed
  (PR #84, `web/src/realtime.ts`). Unit-tested only — see the reconnect bullet below.

**Not started:** anything outside this repo. No domain, no tunnel, no `cloudflared` LXC, no
Cloudflare account config. Nothing in `infra/docker-compose.yml`, `infra/Caddyfile` or `appsettings.json` has
been changed for the tunnel yet either — the items under "What should change" are all still open.

**The actual blocker is the domain.** No domain is owned, so a persistent named tunnel and a real
hostname can't exist yet, and the `AllowedHosts` / `trusted_proxies` / Cloudflare-rule work all
depends on knowing the hostname. Rough order once one exists:

1. Register a domain (or move an existing one's DNS to Cloudflare). Owner task, not an agent one.
2. Build the `cloudflared` LXC on the hypervisor; one ingress rule → `http://<app-host>:80`.
3. Land the remaining go-live security items with the tunnel: Access in front of `/api/admin/*`,
   and re-key the (now-shipped) login rate limiter onto `CF-Connecting-IP` so it doesn't collapse
   into a single global bucket.
4. Tighten `AllowedHosts`, add `infra/Caddyfile` `trusted_proxies`, confirm the real `JWT_SIGNING_KEY`.
5. Work the verification list at the bottom — including the PWA path, which has never run in a
   real deployment, and the `cloudflared`-restart reconnect check that closes out PR #84.

A `trycloudflare.com` quick tunnel is a reasonable way to smoke-test step 2's plumbing (and much
of the verification list) before step 1 exists — just not as the real setup.

## Current state

Heliograph runs on the home LAN only: a container on the deploy host (`<app-host>`) runs the
`infra/docker-compose.yml` stack (`db` + `api` + `web` + `caddy`). Caddy is the only container publishing
a port (`:80`, plain HTTP, no TLS, no domain — see `infra/Caddyfile`). `web` and `api` are same-origin
behind Caddy (`/api/*` → `api:8080`, everything else → `web:80`).

## What actually becomes internet-reachable

Spelled out rather than left implied, because it's what the rest of this doc's risk reasoning rests
on. Exactly four endpoints answer without a token; every other controller is class-level
`[Authorize]` (`GamesController`, `RoomsController`, `InvitesController`, `FriendsController`,
`UsersController`, `LeaderboardController`) or `[Authorize(Policy = "Admin")]` (`AdminController`):

- `GET /api/health` — returns `{status:"ok"}` and nothing else (`backend/api/Controllers/HealthController.cs`).
- `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
  (`backend/api/Controllers/AuthController.cs`).

`GET /api/leaderboard` used to be the fifth (an earlier draft of this section both miscounted it
and credited it with exposing avatars it never returned). It's `[Authorize]`d now: nothing needed
it open — `/leaderboard` renders inside `AppLayout`, which bounces a session-less visitor to
`/login` — and left anonymous it handed the internet every rated account's display name, rating and
`UserId`, the last of which is exactly the input `POST /api/friends/requests` and `POST /api/invites`
take.

**There is no self-registration endpoint** — accounts are admin-created only, via
`POST /api/admin/users`. `AuthController`'s own doc comment
(`backend/api/Controllers/AuthController.cs:11-15`) records that this was deliberate, "matching the 'log in
before you can touch anything' access model once this is exposed to the internet". That decision is
the single biggest reason going public is low-risk here: no account spam, no unauthenticated write
path, no anonymous game creation.

The corollary: `POST /api/auth/login` is the *entire* unauthenticated write surface, which is why
the login rate limit below is a go-live item rather than future hardening.

## Owner decisions (locked)

- **No port-forwarding.** Use a Cloudflare Tunnel (`cloudflared`) — outbound-only from the homelab
  side, no inbound firewall/router rule needed.
- ~~**`cloudflared` gets its own dedicated LXC** on the hypervisor, not a
  sibling Docker container bolted onto the deploy host.~~ **Superseded 2026-09-18** by the
  (privately tracked) public-rollout target architecture: `cloudflared` runs *on* the deploy host as a
  compose service, so the tunnel's origin hop never crosses the LAN and the deploy host's default-deny
  egress firewall (which already allows only DNS plus the tunnel's outbound ports) is the whole
  containment story. A separate LXC would need its own LAN path *into* the deploy host's `:80`. `infra/docker-compose.yml`'s `edge`
  network reserves `172.30.53.2` for the service, and `infra/Caddyfile` trusts exactly that address.
  Steps 2 and the `trusted_proxies` bullet below that still say "LXC" predate this.
- **One public hostname, pointed at Caddy's `:80`.** The tunnel's ingress config should have a single
  rule mapping the chosen hostname to `http://<app-host>:80` and let Caddy keep doing the
  `/api/*` vs. everything-else split it already does. Do **not** configure the tunnel with separate
  hostnames for web and api — see the CORS gotcha below.
- **Domain**: none owned yet as of 2026-09-14. Needs registering (or an existing domain's DNS moved
  to Cloudflare) before a persistent named tunnel + real hostname can exist. A `trycloudflare.com`
  quick tunnel is fine for a one-off smoke test of `cloudflared` itself, not for the real setup.

## Why no CORS / TLS / auth changes are needed in this repo

- **CORS**: `backend/api/Program.cs` has no `AddCors`/`UseCors`, and none is needed as long as the tunnel
  keeps web+api same-origin (see owner decision above). If that ever changes, this breaks silently —
  flagged in `GOTCHAS.md`.
- **TLS**: Cloudflare Tunnel terminates public TLS at the Cloudflare edge and encrypts the tunnel
  itself; Caddy can keep serving plain `:80` inside the tunnel exactly as it does today. No
  `UseHttpsRedirection()`/HSTS needed in `Program.cs` — TLS is deliberately the reverse proxy's job
  (see `README.md`'s deployment section).
- **Auth**: JWT-only, tokens in `localStorage`, no cookies — nothing here assumes LAN-only or
  same-network access, so going public doesn't change the auth model.
- **SignalR**: the hub is reached at `/api/hub` through the same Caddy origin; Cloudflare Tunnel
  supports WebSocket upgrades by default, so no hub-side change is needed either. The client also
  keeps SignalR's full WebSocket → SSE → long-polling fallback chain
  (`web/src/realtime.ts:128-140` passes no `transport` restriction), so even a blocked upgrade
  degrades rather than fails outright.
- **Frontend URLs**: everything is origin-relative — `/api/hub` (`web/src/realtime.ts:133`),
  relative REST paths, and a manifest with `start_url: '/'` / `scope: '/'` (`web/pwa.config.ts`).
  There is no `VITE_`-style API base URL anywhere, so a new public hostname needs no frontend build
  change.

## What the tunnel switches on for the first time

The LAN deployment serves plain HTTP on a bare IP, which is **not a secure context**.
`web/src/diagnostics.ts:42-45` already documents one consequence (`crypto.randomUUID()` is
`undefined` there, hence the non-crypto trace-id fallback). Service workers are the other:
**nothing `docs/backlog/05-pwa.md` built has ever run in a real deployment.** The public HTTPS hostname is
the first environment where the SW registers at all, where the install prompt can appear, and where
`PwaUpdatePrompt` can fire.

Two consequences worth planning for:

- **Cloudflare's edge becomes a new intermediate cache in exactly the path `GOTCHAS.md`'s "The
  service worker must be `no-cache`" entry warns about.** `web/nginx.conf:20` sets
  `Cache-Control: no-cache` at the origin for everything outside `/assets/`; confirm the edge
  honours it for `/sw.js`, `/workbox-*.js`, `/index.html` and `/manifest.webmanifest`, or add a
  Cloudflare Cache Rule bypassing cache for those paths. Get this wrong and installed clients
  silently stop updating, with no error anywhere.
- **The LAN and tunnel paths stop being equivalent.** "LAN still works unchanged" (below) stays true
  for gameplay, but PWA install only ever works via the tunnel hostname — so the public hostname
  becomes the preferred path for mobile, not merely an additive one.

## What should change before/around going live

- **`backend/api/appsettings.json`**: `AllowedHosts` is currently `"*"`. Once the domain is chosen, tighten
  it to the real public hostname *plus* `<app-host>` — the LAN path sends that as its `Host`
  header, so a hostname-only value would 400 every LAN request. Prefer injecting it as an
  `AllowedHosts` env var from `infra/docker-compose.yml`, the way `Jwt__Key` and the connection string
  already are, rather than baking the public hostname into committed appsettings.
- **`infra/Caddyfile`: a `trusted_proxies` global block.** Caddy's `reverse_proxy` sets
  `X-Forwarded-Proto` from its own view of the hop and (Caddy 2.7+) only preserves an inbound value
  when the peer is listed in the global `trusted_proxies` option — and `infra/Caddyfile` has no global
  options block at all. So `cloudflared`'s `X-Forwarded-Proto: https` is likely overwritten with
  `http`, and `backend/api/Program.cs:153-159`'s `UseForwardedHeaders` then faithfully applies the wrong
  scheme. The observable symptom is an `http://` absolute URL in the `Location` header of the three
  `CreatedAtAction` call sites (`backend/api/Controllers/GamesController.cs:55`, `:78`,
  `backend/api/Controllers/AdminController.cs:43`) on an otherwise-https site. Verify with
  `curl -i -X POST https://<host>/api/games ...` once the tunnel is up; if the scheme comes back
  `http`, add `trusted_proxies static <cloudflared LXC IP>` to a global block. Low impact today (no
  client follows the `Location` header) but it's a repo-tracked file, so it's recorded here rather
  than left to be rediscovered. **Done for the client-IP half (2026-09-23)**, and the global block
  now exists: `trusted_proxies static 172.30.53.2/32` (cloudflared's reserved `edge` address, not an
  LXC IP; see the superseded owner decision above), so the `X-Forwarded-Proto` half should also come
  out right. It still needs the `Location`-header check above once the tunnel is up. The client IP
  needed one more line than this bullet originally assumed: `header_up X-Forwarded-For {client_ip}`,
  because `trusted_proxies` alone doesn't change what `reverse_proxy` appends. See `GOTCHAS.md`.
- **A Cloudflare rate-limit rule on `POST /api/auth/login`.** ~~Not future work~~ — **partly done,
  in-app rather than at the edge.** `backend/api/Program.cs`'s `AddRateLimiter` now caps login at 10
  attempts per client IP per 5 minutes (`RateLimitOptions`, overridable via
  `RateLimit__LoginPermitLimit` / `RateLimit__LoginWindowSeconds`), returning 429 with a
  `Retry-After`. That closes the LAN path too, which an edge-only rule never would. Two caveats
  keep this bullet open rather than deleted:
  - ~~**The partition key breaks under the tunnel**~~ **Fixed 2026-09-23.** Caddy resolves the client
    from `CF-Connecting-IP` when, and only when, the peer is cloudflared's reserved address, and hands
    the API exactly that IP. Failed logins and 429s are now logged with it. See `GOTCHAS.md`.
  - **Still no per-account lockout, by owner decision (2026-09-23).** The answer to the distributed
    case below is the Cloudflare edge rule plus Cloudflare Access in front of `/api/admin/*`, not
    lockout code, which would let anyone lock a named account (including the admin) out. `backend/api/Program.cs`'s `AddIdentityCore` configures `Password.*`
    and `RequireUniqueEmail` but no `options.Lockout`, and `backend/api/Services/AuthService.cs:80` calls
    `userManager.CheckPasswordAsync` directly rather than going through `SignInManager`, so
    Identity's failure counters never increment even if lockout were configured. With the
    deliberately-relaxed password policy (8 chars, digit only) and the admin account's email sitting
    in committed config (`backend/api/appsettings.json:18`), a *distributed* attacker still gets unmetered
    guesses against a named admin account. A Cloudflare rate-limit rule on top of the in-app one is
    the cheapest answer; per-account lockout is the thorough one.
- **Cloudflare Access in front of the admin surface.** Also not future work: `/api/admin/*` already
  exists and is the highest-value target in the app — `backend/api/Controllers/AdminController.cs:19-21` is
  `[Route("backend/api/admin")]` + `[Authorize(Policy = "Admin")]` over 17 endpoints including
  `DELETE users/{id}`, `POST users/{id}/password`, `DELETE games/{id}` and
  `POST games/{id}/force-end`. It's guarded by the same JWT + `Admin` claim as everything else, so
  it inherits exactly the brute-force gap above. Putting Access in front of `/api/admin/*` and the
  web admin route costs nothing and takes the admin surface off the public internet entirely.
- **Confirm the deployed `JWT_SIGNING_KEY` is a real secret**, not `.env.example`'s
  `changeme-generate-a-real-256-bit-secret-for-deploy`. It lives only in `infra/.env` on the deploy host,
  so it can't be checked from the repo — but a placeholder signing key means anyone can forge an
  admin token, which matters immeasurably more once the host is public than it did on the LAN.
- **The hub's reconnect weakness is fixed (PR #84), but only unit-tested.** Restarting `cloudflared` (or an
  edge blip, or a phone backgrounding) mass-drops every hub connection, and
  `AbandonmentGraceSeconds = 45` (`backend/api/Services/GameService.Endings.cs:23`) means a client that
  doesn't reconnect inside 45s can lose a live game to an abandonment claim. The client used to
  give up permanently at ~42s, *just* inside that window — LAN made it unreachable, the public
  internet wouldn't have. `hubRetryPolicy` (`web/src/realtime.ts`) now retries indefinitely and
  densely through the grace window, and a closed singleton is rebuilt rather than handed back dead.
  What's **not** yet proven is that behaviour against a real socket through the tunnel: see
  `docs/bugs/hub-reconnect-permanent-loss.md` (still `needs-owner-check`) and the reconnect item in the
  verification list below. Restarting `cloudflared` mid-game is the check that closes it.
- **Dev/prod DB separation** (`GOTCHAS.md`, "Deliberately deferred" section) was already flagged as
  something to revisit "before anything resembling real external deployment" — this is that moment.
  Not blocking the initial tunnel setup, but shouldn't be put off indefinitely once the app is
  actually public.
- Remaining Cloudflare-side hardening is genuinely future work: WAF rules beyond the login limit,
  and security response headers (there's no CSP, `X-Frame-Options`/`frame-ancestors` or
  `X-Content-Type-Options` anywhere today — worth adding at Caddy or via Cloudflare Transform Rules
  given a live admin UI, but not needed for "make it reachable").

## Verification once the tunnel is up

- Public hostname loads the web app; a game can be created and played end-to-end (exercises both
  REST and the SignalR hub / WS upgrade through the tunnel).
- Login/JWT flow works over the public hostname, not just LAN.
- LAN path (`<app-host>` directly) still works unchanged — this is additive, not a replacement.
- **Idle hub**: leave a timed game untouched for >2 minutes, then move. This is what actually tests
  the WS connection surviving the edge — SignalR's default 15s keep-alive ping should cover any
  idle-connection timeout, but that's unverified through Cloudflare, and a game played straight
  through in 90 seconds never exercises it. Then confirm a `claim-timeout` still resolves correctly.
- **Reconnect**: restart `cloudflared` mid-game and confirm the client recovers rather than sitting
  dead until a reload, and that a reconnect inside 45s defuses the opponent's abandonment claim.
  This is the outstanding live confirmation for `docs/bugs/hub-reconnect-permanent-loss.md` — the fix is
  unit-tested but has never driven a real socket.
- **PWA, first real exercise**: the service worker registers over the public hostname; install works
  on Android and iOS; then redeploy and confirm `PwaUpdatePrompt`'s "new version" toast fires —
  which is also the check that Cloudflare's edge isn't caching `sw.js`.
- `curl -i` a `POST /api/games` and check the `Location` header's scheme (see the `trusted_proxies`
  bullet).
