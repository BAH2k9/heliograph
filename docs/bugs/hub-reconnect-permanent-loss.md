---
status: needs-owner-check
area: realtime
reported: 2026-09-14
---
## Report
Found during code review (not yet reproduced in a live browser session — see Repro steps).

Two linked defects in the `realtime.ts` SignalR singleton:

1. **Reconnect retries are exhausted permanently, well inside the server's abandonment window.**
   `ensureConnection()` builds the hub connection with a bare `withAutomaticReconnect()`
   (`web/src/realtime.ts:134`). The `@microsoft/signalr` default retry schedule is 0ms / 2s / 10s /
   30s, and then it **stops retrying forever** — the last attempt lands ~42s after the drop. The
   server accepts an abandonment claim against a disconnected opponent after
   `AbandonmentGraceSeconds = 45` (`backend/api/Services/GameService.Endings.cs:23`).

   This is **not** a narrow 42s-to-45s race, which is how it first reads. Because defect 2 below
   makes the give-up permanent, *any* outage longer than ~42s costs the player the game — not just
   one that lands in the 3s gap. An abandonment only ends the game if the opponent actually calls
   the claim endpoint, so a player offline for five minutes whose opponent never claims should
   still be able to walk back into a live game; with a longer or backoff retry schedule they would.
   Instead the client has stopped trying, so they can't return at all, and the opponent can claim
   at leisure. The 42s/45s proximity is what makes the loss *likely*; the permanence is what makes
   it unrecoverable.

2. **The singleton never recovers once retries are exhausted, even after connectivity returns.**
   `conn.onclose(...)` (`web/src/realtime.ts:186`) only logs to the console and pushes a
   diagnostics ring entry — it does not null the module-level `connection` and does not rebuild.
   `connection` is set to `null` in exactly one place, `disconnect()`
   (`web/src/realtime.ts:337`), which is only reached when the auth identity changes
   (login/logout). Meanwhile `ensureConnection()` starts with `if (connection) return connection`
   (`web/src/realtime.ts:129`). Net effect: every later caller (`followGame`,
   `subscribeToUserInvites`, etc.) gets handed back the dead, closed connection, so realtime stays
   silently broken until a full page reload. REST keeps working the whole time (`store.ts`'s
   `claimTimeout`/`claimAbandonment` and the rest of the REST surface are unaffected), which is
   exactly why this doesn't present as a connection problem to whoever's debugging it.

**Why it matters / severity:** on the LAN-only deployment (Caddy on plain `:80`, CT107
`192.168.0.20`) a >42s hub outage essentially never happened, which is why this has survived until
now. It stops being unreachable the moment the Cloudflare Tunnel work lands (see
`docs/scoping/cloudflare-tunnel.md`, "What should change before/around going live") — two extra
network hops, mobile clients on flaky connections, and a `cloudflared` restart that drops every
connection at once. See also the `GOTCHAS.md` "Exhausted hub reconnects are permanent, and 45s
later that's a forfeit" trap entry (`## Traps` section) for the same finding in the project's
running gotcha list — this file is the durable, actionable hand-off for actually fixing it.

**Design constraint for the fix — read before touching this:** do not fix this by simply raising
`AbandonmentGraceSeconds`. That constant is a product decision about how long a disconnected
player keeps their game (see its doc comment: "owner decision,
`backlog/02-disconnect-abandonment.md`"), not a knob to compensate for a client bug. The actual
defects are both client-side: a retry policy that gives up, and a singleton that can't be revived
after it does. A likely shape for the real fix is a custom `nextRetryDelay` retry policy (passed to
`withAutomaticReconnect()`) plus nulling `connection` in `onclose` so `ensureConnection()`'s
`if (connection) return connection` check naturally rebuilds on next use — but that's a *suggested*
direction, not a decided one; choosing the actual approach is the fixing PR's job.

**Also relevant to whoever fixes it:** `conn.onreconnected` (`web/src/realtime.ts:195`) already
re-establishes hub group membership via `subscribeToUserIfAuthenticated` + re-`invoke('Join', ...)`
for the followed game, because `withAutomaticReconnect`'s built-in reconnect drops group membership
server-side. Any rebuild-on-close path added for defect 2 has to do that same re-subscription work
(re-`SubscribeToUser`, re-`Join` the followed game if any) — it can't just call
`ensureConnection()` and assume group state carries over, since a *new* connection starts with no
group membership at all. `web/src/realtime.test.ts` is the existing test file for this module.

## Notes
(none yet)

## Repro steps
Not yet reproduced in a live browser session — this was found by static code reading, not by
observing the failure happen. `claude-in-chrome`-driven browser repro is owner-machine-only per the
`heliograph-bugfix` skill (needs a live Chrome instance with the extension's site permissions already
granted) and wasn't available in the environment this bug was filed from.

Intended repro shape, for whoever picks this up with a live session:
1. Start a game (bot opponent is sufficient — `POST /api/games/bot` — no need for two real
   clients).
2. Interrupt the hub connection for >45s mid-game: kill the API/proxy, or use devtools to take the
   network offline, for at least 45 seconds.
3. Confirm (a) the opponent (or a claim call, if using the bot) can successfully claim the
   abandonment win after 45s even though the client's own retry schedule gave up at ~42s, and
   (b) after restoring connectivity, no `gameEnded`/hub events arrive and no reconnect attempt is
   made until the page is reloaded — the diagnostics ring (`pushRingEntry` calls in
   `web/src/realtime.ts`) should show a `connection closed` entry with no further `reconnecting` /
   `reconnected` entries after it, confirming defect 2.

## Root cause
Established already from code reading (see Report above) — not something that needs re-deriving:
- Defect 1: `HubConnectionBuilder.withAutomaticReconnect()` with no argument uses the SDK's default
  `[0, 2000, 10000, 30000]` retry-delay array and returns `null` (stop retrying) past the end of
  that array — `web/src/realtime.ts:134`.
- Defect 2: `onclose` has no side effect on the module-level `connection` variable
  (`web/src/realtime.ts:186-189`); the only assignment to `connection = null` is in `disconnect()`
  (`web/src/realtime.ts:337`), gated behind an auth-identity change; `ensureConnection()`
  short-circuits on any truthy `connection` (`web/src/realtime.ts:129`) regardless of whether the
  underlying `HubConnection` is actually still live.

## Fix
Both defects fixed in `web/src/realtime.ts`:

- **Defect 1** — replaced the bare `withAutomaticReconnect()` with an exported `hubRetryPolicy`
  (`IRetryPolicy`): one instant attempt, then every 3s through a 60s dense window, then every 30s
  **indefinitely**. The dense window is deliberately wider than the server's 45s grace so several
  attempts land while reconnecting can still defuse a claim, and the tail never returns `null`, so
  "came back after lunch" works. The window is now a documented coupling to
  `AbandonmentGraceSeconds`, not an incidental default — see the `GOTCHAS.md` entry.
- **Defect 2** — `onclose` now nulls the singleton (guarded on connection identity, so a replaced
  connection closing late can't wipe its live replacement), and `ensureConnection()` discards a
  singleton it finds in `Disconnected` state and rebuilds. Only that one state qualifies:
  `Connecting`/`Reconnecting` are still reused, since rebuilding mid-reconnect would race the
  automatic attempt and leave two sockets fighting over the same groups.
- **Supporting change** — the post-connect work `onreconnected` was already doing (re-`SubscribeToUser`,
  re-`Join` the followed game, fire `onReconnected` so the store resyncs) is extracted into
  `reestablishSubscriptions` and now also runs on the fresh-start path. Without this a rebuilt
  connection would come up with no server-side group membership and silently receive nothing. The
  `followingGameId` guard keeps it a no-op on a genuine first connect, so there's no double-`Join`
  race with `followGame`.

With the retry policy retrying forever, `onclose` from exhausted retries is essentially unreachable
— the defect-2 changes are the safety net that stops *any* close (explicit `stop()`, a start
failure) from wedging the module permanently, rather than the primary fix.

## Verification
**Unit-tested, not yet confirmed live** — hence `status: needs-owner-check`.

8 new tests in `web/src/realtime.test.ts` (382 passing total, was 374). All three gates green from
`/web`: `npm run lint && npm run test && npm run build`.

Honest accounting of what those tests actually prove: with the production changes reverted, exactly
**2 of the 8 fail** — `hubRetryPolicy > is actually handed to the connection builder` (catches a
revert to the bare default) and `recovery from a closed connection > rebuilds a closed connection
instead of handing the dead one back forever` (the core defect: it asserts the rebuilt connection
starts, re-`SubscribeToUser`s, re-`Join`s `game-1`, and fires `onReconnected`). The other 6 are unit
assertions on `hubRetryPolicy`'s delay curve plus guards on the new code's own edges (reconnecting
connections aren't rebuilt; a late close doesn't wipe a replacement) — they pass either way by
design, since they describe new behaviour rather than reproducing the old bug.

**Still needs a live session** (the reason this isn't `verified`): the `## Repro steps` above were
never run. Nothing here proves the real `@microsoft/signalr` client honours the policy as intended
against a real socket, or that a reconnect inside the grace window actually defuses an abandonment
claim end-to-end — `withAutomaticReconnect` is mocked away in the test file, so the policy is
asserted directly rather than observed driving a reconnect. Run the repro (ideally through the
Cloudflare Tunnel once it's up, which is the environment that motivated this) before deleting this
file.
