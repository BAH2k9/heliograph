---
feature: friend-invites-matches
status: done
depends_on: ["friend-invites-friendships"]
backend_branch: feat/friend-invites-matches-be
frontend_branch: feat/friend-invites-matches-fe
---

# Friend invites — match invites + real-time delivery (part 2 of 2)

Second half of the friend-invite feature, on top of `06-friend-invites-friendships.md` (must be
`status: done` first — this plan's invite-picker needs a real friends list to pick from, and its
`POST /api/invites` requires an accepted friendship to exist). Full scoping/rationale in
`docs/scoping/friend-invites.md` — this file is the pinned spec.

## Why

Friendships alone don't start a game. This plan adds the actual "challenge a friend to a match"
flow: pick a friend, configure the game, send an invite, they get a real-time in-app notification,
they click Join and land straight in a seated room — no join code ever shown to either side.

## Owner decisions already made

- **The join-code UI is retired from primary navigation, not from the backend.** `RoomsController`
  /`RoomService`'s code create/join endpoints are untouched and still exist — a friend-invite match
  is still, mechanically, a room with a `JoinCode` under the hood. `PlayHubScreen`'s current
  "create a room, get a code" flow stops being the primary `/play` entry point; friend-invite
  becomes the primary flow instead. (Whether the old code-entry flow stays reachable as a secondary
  "play with a link" option, or is dropped from the UI entirely, is an implementation judgment
  call — recommend keeping it reachable but secondary, since it's the only invite path guests have.)
- **Delivery: real-time in-app toast**, not REST-poll-only and not OS push. An authenticated
  client must be reachable the moment an invite is sent, regardless of what page it's on — this
  needs a new per-user SignalR group, since `GameHub` today is game-scoped only.
- **Rated: the inviter chooses per invite** — a toggle on the invite-composer screen. No fixed
  default.
- **First move: random.**
- **Room created on accept, not on send** — the invite row carries the full config; no game row
  exists until `POST /api/invites/{id}/accept`, so a declined/expired invite never leaves an orphan
  game.
- **Expiry follows the existing claim pattern** (`CLAUDE.md`'s "claim" pattern): store
  `ExpiresAtUtc`, re-check it server-side at accept time. No background sweeper/worker to expire
  rows proactively.

## Wire contract

- New entity `MatchInvite`: `Id (Guid)`, `InviterId (Guid)`, `InviteeId (Guid)`, `Ruleset (string)`,
  `Layout (string)`, `TimeControl (string?)`, `Rated (bool)`, `Status (enum: Pending, Accepted,
  Declined, Expired)`, `CreatedAtUtc`, `ExpiresAtUtc` (recommend a fixed TTL, e.g. 5 minutes — pick
  something and note it in the PR, this is an implementation judgment call not worth blocking on).
- `POST /api/invites` — `[Authorize]`, body `{ "inviteeUserId": "<guid>", "ruleset"?: string,
  "layout"?: string, "timeControl"?: string, "rated": bool }` (ruleset/layout default the same way
  `CreateRoomRequest` does). 400 if `inviteeUserId` isn't an accepted friend, or ruleset/layout/time
  control name is unknown (reuse `RoomService`'s existing resolution helpers — don't duplicate that
  validation). 201 → `MatchInviteResponse(Guid Id, ExpiresAtUtc, ...)`. On success, pushes
  `inviteReceived` (see hub section) to the invitee.
- `POST /api/invites/{id}/accept` — `[Authorize]`, caller must be the invitee. 404 if not found or
  not pending. 410 (Gone) if past `ExpiresAtUtc` (re-check server-side, per the claim pattern —
  never trust that the client only calls this while it still looks valid) — flip `Status` to
  `Expired` on this path if it's discovered stale here rather than relying on anything proactive.
  On success: create the game exactly the way `RoomService.CreateRoomAsync` does (reuse its
  internals — extract a shared private helper if needed rather than duplicating the retry-on-code-
  collision logic), seat `InviterId`/`InviteeId` directly as P1/P2 (randomly assigned per the "first
  move: random" decision), set `Rated` from the invite's own `Rated` flag (not from the "both seats
  are account holders" inference `JoinRoomAsync` normally uses — this path decides it explicitly),
  initialize the clock same as `JoinRoomAsync` does. 200 → the same `RoomResponse` shape
  `RoomsController.Join` already returns, so the frontend can reuse its existing "you're in this
  room now" handling.
- `POST /api/invites/{id}/decline` — same auth shape, sets `Status: Declined`. 204.
- `GET /api/invites/pending` — `[Authorize]`, invites where the caller is the invitee and still
  `Pending` (and not yet past `ExpiresAtUtc`). This is the fallback list the toast's "detail fetch"
  reads from, and what a client that missed the live push (was offline, reconnecting) catches up
  against on load — never trust the push payload alone as authoritative content, same discipline as
  every other hub event in this app.

### Hub changes (`api/Hubs/GameHub.cs`)

- New hub method, e.g. `SubscribeToUser()` — `[Authorize]` (the hub already reads the bearer token
  via `accessTokenFactory`; use `Context.UserIdentifier`/the existing auth claim to get the caller's
  id server-side, never a client-supplied id), adds the connection to a group named
  `user:{userId}`. Called once per connection, on connect/reconnect — alongside, not instead of,
  the existing per-game `Join`. This is the same connection `realtime.ts` already owns; don't add a
  second SignalR connection.
- `POST /api/invites` handler, after persisting the invite, broadcasts
  `Clients.Group($"user:{inviteeId}").SendAsync("inviteReceived", new { inviteId })` — minimal
  payload (just enough to trigger a `GET /api/invites/pending` refetch), per the "hub only fans out
  what a controller already decided" rule. This is the first hub broadcast in the codebase that
  isn't scoped to a game group — call this out explicitly in the PR body as a deliberate, reviewed
  change to `GameHub`'s scoping model, not a quiet expansion of it.

## Backend scope

- Migration: `MatchInvites` table.
- Extract the shared game-creation logic `RoomService.CreateRoomAsync` and the new accept-path both
  need (ruleset/layout/time-control resolution + `NewGame`/`JoinCode` retry-on-collision) into a
  private helper both call, rather than duplicating it — `RoomService.cs`'s own doc comment already
  names this file as where a task like this belongs.
- New `InviteService` (`AddScoped`) + `InvitesController`, following the `RoomService` shape (owns
  its own transaction for the accept path, mirroring `JoinRoomAsync`'s transaction).
- `GameHub` changes above.
- `InviteServiceExceptions` (`UnknownInviteException`, `NotYourInviteException`,
  `InviteExpiredException`, `NotFriendsException`) → mapped to 404/403/410/400 respectively.

## Frontend scope

- `realtime.ts`: on connect/reconnect (alongside the existing per-game `Join` call when applicable),
  call the new `SubscribeToUser` hub method whenever the user is authenticated (guests don't
  subscribe — they can't receive friend invites at all, consistent with friend-invite being an
  authenticated-only feature). Register a handler for `inviteReceived` that triggers a
  `GET /api/invites/pending` refetch.
- A small always-mounted "pending invites" surface (e.g. a badge in `AppLayout`'s nav, or a toast —
  your call on exact presentation, but it must be visible from anywhere in the app, not just
  `/play`) showing pending invites with Join/Decline actions. Join calls
  `POST /api/invites/{id}/accept` and navigates into the resulting room exactly like
  `RoomsController.Join`'s existing response is already handled elsewhere in `store.ts`.
- New `/play/invite` screen (or repurpose `PlayHubScreen` — your call) replacing the current
  primary "create a room" entry point: pick a friend (from `GET /api/friends`, plan 06), the
  existing ruleset/layout/time-control picker `PlayHubScreen` already has, a rated toggle, "Send
  invite" → `POST /api/invites`.
- Update `web/CLAUDE.md`'s realtime section if the connection's responsibilities meaningfully
  change (it currently documents `realtime.ts` as "following the current game" — this plan makes
  that no longer the whole story once a user-group subscription exists independent of any game).

## Tests

- `api.tests/Services/InviteServiceTests.cs`: send → accept (creates game, seats both, sets
  `Rated` from the invite, random P1/P2), send → decline, expired-at-accept-time 410, accept by
  someone who isn't the invitee 403/404, invite to a non-friend 400.
- `api.tests/Api/` integration test asserting the `inviteReceived` broadcast fires to the right
  user group (if the existing hub test harness supports asserting on group membership/broadcasts —
  follow whatever pattern `GameHub`'s existing tests already use for `opponentJoined`/etc.).
- `web/src` tests for the pending-invites surface (renders on `inviteReceived` refetch, Join
  navigates into the room) and the new invite-composer screen.

## Out of scope

- Matchmaking/random opponent queue — separate, bigger feature (see
  `docs/scoping/qol-opportunities.md` item 1), not built here.
- OS-level Web Push (works when the app is fully closed) — the real-time toast here only works
  while the client has an open connection; that's the deliberately chosen scope, not a gap to
  quietly fill in this plan.
- Cancelling a sent invite before it's accepted/declined/expired (the inviter just waits it out or
  the invitee declines) — add only if it turns out to be needed; not in the pinned wire contract
  above.

## If blocked

Edit this file's frontmatter to `status: blocked` plus a one-line `blocker:` if something genuinely
ambiguous comes up beyond what's resolved above (including if plan 06 hasn't actually merged yet).
Ordinary implementation judgment calls (exact TTL, exact toast presentation, whether the old
code-entry flow stays reachable as a secondary option) are yours — don't block on those.
