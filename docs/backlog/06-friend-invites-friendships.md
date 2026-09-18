---
feature: friend-invites-friendships
status: done
depends_on: []
backend_branch: feat/friend-invites-friendships-be
frontend_branch: feat/friend-invites-friendships-fe
---

# Friend invites — friendships (part 1 of 2)

First half of the friend-invite feature: being able to find, add, and manage friends. Part 2
(`07-friend-invites-matches.md`, depends on this being `done`) adds the actual match invite +
real-time delivery + retiring the code UI. Full scoping/rationale lives in
`docs/scoping/friend-invites.md` — read it for the "why", this file is the pinned spec for what to
build.

## Why

There is no friends system at all today — no way to find another account, no relationship that
persists, nothing to populate an invite-picker with. This plan builds that half in isolation so it
can be reviewed/merged on its own before the match-invite plumbing (real-time hub delivery, retiring
the join-code UI) lands on top of it.

## Owner decisions already made

- **Search by `DisplayName`, disambiguated Discord-style.** `DisplayName` is not unique. Add a
  `Discriminator` field to `ApplicationUser` — a fixed-width numeric string (4 digits, zero-padded,
  e.g. `"0007"`), assigned randomly at account creation. Uniqueness is only enforced on the pair
  `(DisplayName, Discriminator)` — not globally — same as Discord: two different display names can
  reuse the same discriminator, only a collision on the *same* display name needs a re-roll.
  `DisplayName` alone stays the identity shown in-game, on the leaderboard, in profiles, etc.; the
  discriminator only ever appears alongside it in friend-search/friend-list contexts, rendered as
  `DisplayName#nnnn`.
- **Friends/family scale, not general discovery.** No pagination-at-scale concerns, no fuzzy
  search, no rate limiting beyond what's already standard on the API. A simple `WHERE DisplayName
  ILIKE '%...%'` prefix/contains match is fine.
- **Friendship is a mutual, request-based relationship** (request → accept/decline), not a
  one-sided follow. Either side can unfriend at any time (removes the row entirely, no "blocked"
  history kept for v1 — blocking is out of scope, see below).

## Wire contract

- `ApplicationUser` (`backend/api/Domain/ApplicationUser.cs`) gains `Discriminator` (`string`, exactly 4
  digits, not nullable — always assigned at creation). Add a unique index on
  `(DisplayName, Discriminator)`.
- New entity `Friendship`: `Id (Guid)`, `RequesterId (Guid, FK ApplicationUser)`,
  `AddresseeId (Guid, FK ApplicationUser)`, `Status (enum: Pending, Accepted)`,
  `CreatedAtUtc (DateTime)`. A declined request is just deleted, not stored as a status — there's
  nothing useful to keep once declined (mirrors "null carries meaning, don't over-model" spirit:
  don't add a `Declined` status that nothing ever reads). Unique index on
  `(RequesterId, AddresseeId)` — but note a pending request in *either* direction between the same
  two users should be treated as "already exists" at the service layer (don't allow both A→B and
  B→A pending rows simultaneously; if B tries to request A while A→B is already pending, treat it
  as an implicit accept instead — same UX as most friend-request systems).
- `GET /api/users/search?q=<string>` — `[Authorize]`. Matches `DisplayName` (case-insensitive
  contains). Returns up to 20 hits: `UserSearchResult(Guid Id, string DisplayName, string
  Discriminator, string? AvatarId)`. Excludes the caller themself. Empty/whitespace `q` → 400.
- `POST /api/friends/requests` — `[Authorize]`, body `{ "addresseeId": "<guid>" }`.
  - 400 if `addresseeId` doesn't exist, or equals the caller's own id.
  - 409 if already friends, or a request already pending in the same direction.
  - Implicit-accept case above: if the reverse request is pending, this call accepts it instead of
    creating a new row — 200 with `{ "status": "accepted" }`. Otherwise 201 with
    `{ "status": "pending" }`.
- `POST /api/friends/requests/{id}/accept` — `[Authorize]`, caller must be the `AddresseeId` on
  that pending request. 404 if no such pending request or caller isn't the addressee. 200 →
  the new `FriendSummary` (see below).
- `POST /api/friends/requests/{id}/decline` — same auth shape; deletes the row. 204.
- `DELETE /api/friends/{friendUserId}` — `[Authorize]`, removes an accepted friendship in either
  direction. 204 whether or not one existed (idempotent unfriend).
- `GET /api/friends` — `[Authorize]`. Returns accepted friendships as
  `FriendSummary(Guid UserId, string DisplayName, string Discriminator, string? AvatarId)[]`.
- `GET /api/friends/requests/incoming` and `GET /api/friends/requests/outgoing` — `[Authorize]`,
  pending requests where the caller is addressee/requester respectively, each entry
  `FriendRequestSummary(Guid RequestId, Guid UserId, string DisplayName, string Discriminator,
  string? AvatarId, DateTime CreatedAtUtc)`.

## Backend scope

- Migration: `Discriminator` column on the Identity user table (backfill existing rows with a
  random 4-digit value, re-rolling on any collision against the new unique index — write this as
  actual migration-time data-fixup code, not a manual one-off script, since it has to run cleanly
  in CI's fresh Postgres same as every other migration) + the new `Friendships` table.
- Assign `Discriminator` on every new-account path (wherever `ApplicationUser` is currently
  constructed at registration — `AuthService`/`AuthControllerHelpers`), retrying on the unique-index
  collision the same shape `RoomService.NewCode()` already uses for join-code collisions.
- New `FriendService` (`AddScoped`, follows the `RoomService`/`GameService` split: thin controller,
  service owns the transaction) + `FriendsController` implementing the endpoints above.
- New `UsersController` (or fold into an existing controller if there's an obviously better home —
  your call) for `GET /api/users/search`.
- `UnknownUserException`/`AlreadyFriendsException`/etc. following the existing
  `RoomServiceExceptions`/`GameServiceExceptions` pattern → mapped to the right HTTP status in the
  controller, same shape as `ClaimSeatException`.

## Frontend scope

- New `web/src/pages/FriendsPage.tsx` (route `/friends`, linked from `AppLayout`'s nav): search box
  (debounced call to `/api/users/search`, results rendered as `DisplayName#nnnn` + avatar + "Add
  friend" button), an incoming-requests list (accept/decline), an outgoing-requests list (shows
  pending, no action), and the accepted friends list (each row has a "Remove" action — a confirm
  step, since unfriending is a bit destructive).
- `web/src/api/client.ts` gains typed wrappers for all six endpoints above;
  `web/src/api/types.ts`/`authTypes.ts` gains the matching response shapes.
- No store changes needed beyond local component state / a small dedicated store if that fits the
  existing pattern better than prop-drilling — your call, but don't overload the existing `store.ts`
  (game state) with friend-list state; keep it separate.
- Existing sidebar/profile display of `DisplayName` elsewhere in the app is **unchanged** — the
  discriminator only shows up on `FriendsPage`'s search/list rows, never appended to a player's name
  in-game or on the leaderboard.

## Tests

- `backend/api.tests/Services/FriendServiceTests.cs` (or integration, your call given `IntegrationFixture`
  is available): request → accept, request → decline, implicit-accept on a simultaneous reverse
  request, duplicate-request 409, unfriend idempotency, search excludes self and matches
  case-insensitively, discriminator collision retry on account creation.
- `web/src/pages/FriendsPage.test.tsx`: search renders results with discriminator, add friend,
  accept/decline incoming, remove friend (with its confirm step).

## Out of scope (here and for the whole feature)

- Blocking users.
- Any match-invite/notification plumbing — that's plan 07.
- Retiring the join-code UI — also plan 07 (this plan only adds the friends surface; the existing
  `PlayHubScreen`/room-code flow is untouched).
- General/public user discovery beyond exact-ish display-name search (no "people you may know",
  no suggestions).

## If blocked

Edit this file's frontmatter to `status: blocked` plus a one-line `blocker:` if something genuinely
ambiguous comes up beyond what's resolved above; stop without opening a PR. Ordinary implementation
judgment calls (exact index names, where `UsersController` lives, exact debounce timing, etc.) are
yours — don't block on those.
