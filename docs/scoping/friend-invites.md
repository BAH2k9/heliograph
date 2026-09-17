# Scope: friend-invite matches

Status: **scoped and decided, not yet planned/built.** Owner decisions below are locked; this is
still not a `plans/*.md` file — per `GOTCHAS.md`, that directory is disposable scaffolding being
wound down, not where new backlog gets wired in. When this is ready to build, open a fresh
`plans/NN-friend-invites.md` (or split into `-be`/`-fe`) that cites this doc, rather than growing
this doc into one.

## Product shape (owner-decided)

- **The join-code system is retired from the UI, not from the backend.** `RoomsController` /
  `RoomService`'s code-based create/join stays exactly as-is under the hood — a friend-invite
  match is still, mechanically, a room with a `JoinCode` — but no screen shows a user a code to
  share manually anymore. The flow is entirely: **Play → invite screen → pick a friend → send
  invite → they get notified → they click Join.**
- **Friends/family only. No random/ranked matchmaking queue.** Confirmed out of scope — see
  `docs/scoping/qol-opportunities.md` item 1, which documents that gap separately for if the owner
  ever wants it later. Don't build any rating-band matching logic for this feature.
- **Delivery: real-time in-app toast.** Not a REST-poll-only pending list, and not OS-level Web
  Push. Whoever is invited sees the invite appear live *anywhere in the app*, not just while
  looking at a specific game. This is the one piece that needs genuinely new plumbing (see below)
  — it's the most expensive of the three delivery tiers originally scoped, picked deliberately over
  the cheaper poll-only option.
- **Rated: inviter chooses per invite.** A toggle on the invite-composer screen, not a fixed
  default. Threads through to the same `Game.Rated` flag `RoomService.JoinRoomAsync` already sets
  — the only difference is who decides it and when (explicitly, at invite time, instead of
  implicitly from "did both seats end up as account-holders").
- **First move: random.** No inviter/invitee asymmetry to build UI around.

## Why delivery is the load-bearing piece

`GameHub` groups are **game-scoped only** today — `Join(gameId, seat)` adds the connection to a
group named by the game id (`GameHub.cs:26`), and `GameConnectionTracker` keys purely on
`(connectionId) -> (gameId, seat)` (`GameConnectionTracker.cs`). There is no per-user hub group
anywhere in the codebase, and `realtime.ts`'s one SignalR connection is documented as "following
the current game" (`web/CLAUDE.md`) — it doesn't exist at all until you're looking at a game.

A real-time toast means an authenticated client needs to be listening on *something* the moment
they log in / open the app, independent of whether they're in a game. Concretely:

- On successful auth (`authStore` hydration, and on login), the client joins a new SignalR group
  scoped to the account, e.g. `Groups.AddToGroupAsync(connectionId, $"user:{userId}")` — this needs
  a new hub method (e.g. `SubscribeToUser()`, auth-gated via the hub's existing bearer-token
  `accessTokenFactory` wiring, no new token plumbing needed) called once at connect time, alongside
  (not instead of) the existing per-game `Join`.
- Decide whether this rides the *same* SignalR connection `realtime.ts` already owns (simplest —
  one connection, joins both a user group and, later, a game group) or a second connection. Same
  connection is the right call: `realtime.ts` already reconnects and re-establishes group
  membership on `onreconnected`; a second connection would duplicate that reconnect/backoff logic
  for no real benefit.
- New hub broadcast: `Clients.Group($"user:{invitee}").SendAsync("inviteReceived", ...)`, fired
  from wherever the invite-accept REST endpoint... no — fired from the **send** endpoint (creating
  the invite is what the invitee needs to hear about), following the existing rule that the hub only
  fans out what a controller already decided (`GameHub`'s own doc comment) — the controller
  persists the invite row first, then the hub pushes.
- The invitee's client, on receiving `inviteReceived`, does a REST fetch of the invite detail /
  refreshes a pending-invites list — never trusts the push payload as authoritative, same
  discipline as every other hub event in this app.

## Data model

Two new tables (per-CLAUDE.md discipline: "additive columns, not new tables" is for a small fixed
set of variants — friendships/invites are neither, so this is a real child table, not more columns
on `ApplicationUser`):

- **`Friendships`** — `(UserId, FriendUserId, Status)` where `Status` is
  pending/accepted/blocked, needed for the "pick a friend" screen to have a list to pick from
  (and for discovery — see below). A friend request is itself a small invite-shaped flow: send,
  accept/decline, remove.
- **`MatchInvites`** — inviter id, invitee id, `Ruleset`/`Layout`/`TimeControl` (same three fields
  `CreateRoomRequest` already takes), `Rated` (bool, the inviter's per-invite toggle),
  `ExpiresAtUtc`, `Status` (pending/accepted/declined/expired).

**Invite expiry follows the existing claim pattern** (`CLAUDE.md`'s "claim" pattern,
`ClaimTimeoutAsync` is the canonical example): store `ExpiresAtUtc` on the row, re-check it
server-side the moment someone tries to accept — no background sweeper/worker.

**Room created on accept, not up front** (resolved from the earlier doc's two options): the invite
row carries the full config (`Ruleset`/`Layout`/`TimeControl`/`Rated`), and only
`POST /api/invites/{id}/accept` actually calls `RoomService.CreateRoomAsync`-equivalent logic and
seats both accounts directly (no join-by-code step for either side, since neither side ever sees a
code). This avoids the orphan-room problem entirely — a declined/expired invite never created a
game row.

## Discovery (owner-decided)

**Search by `DisplayName`, disambiguated Discord-style with a `#nnnn` discriminator.** Adding a
friend is find-by-display-name — good enough for a friends/family user base where the person
sending the request already knows who they're looking for. To make a non-unique field safe to
search on: `ApplicationUser` gets a new `Discriminator` (a fixed-width numeric string, e.g. 4
digits), assigned at account creation and re-rolled only on the rare collision (unique on
`(DisplayName, Discriminator)`, not globally — the discriminator only has to disambiguate people
who share a display name, same as Discord). Shown everywhere as `DisplayName#nnnn` in
search results and the friends list; `DisplayName` alone stays what's shown in-game, on the
leaderboard, etc. — the discriminator is a lookup aid, not a rename of the existing public
identity.

Search endpoint: `GET /api/users/search?q=...` matching `DisplayName` (prefix or contains — a
product-feel choice, not an architectural one), returning enough of each hit to render
`DisplayName#nnnn` plus avatar so the sender can tell people apart before sending a request.

## Rough endpoint/screen shape

- `FriendsController`: `POST /api/friends/requests` (send), `POST
  /api/friends/requests/{id}/accept|decline`, `DELETE /api/friends/{userId}` (unfriend), `GET
  /api/friends` (accepted list, for the invite-picker).
- `InvitesController`: `POST /api/invites` (`{ inviteeUserId, ruleset, layout, timeControl, rated
  }`, requires an accepted friendship), `POST /api/invites/{id}/accept`, `POST
  /api/invites/{id}/decline`, `GET /api/invites/pending` (fallback list, also backs the toast's
  detail fetch and covers the case where the client missed the live push — e.g. was offline).
- Frontend: replaces the current "Host Game" style entry with a `/play/invite` screen — friend
  list (with search/add-friend reachable from it), pick a friend, the existing ruleset/layout/time
  control picker `PlayHubScreen` already has plus the new rated toggle, "Send invite". A toast/badge
  component fed by the new `inviteReceived` hub event, with "Join" taking the invitee straight into
  the created game. `RoomsController`'s code-based join stays reachable only as an internal
  implementation detail (or, if the owner wants, kept as a hidden fallback URL — not surfaced in
  the primary nav).

## Sequencing

Multi-PR, per the repo's branch-naming convention: friendships-as-a-relationship first
(`feat/friend-invites-be1`: `Friendships` table + `FriendsController` + friend-list UI), then
match-invites on top (`feat/friend-invites-be2`/`-fe`: `MatchInvites` table + hub user-group +
invite screen + toast). Don't build it as one PR — the user-scoped hub group alone is a big enough
behavior change to want its own focused review.
