// Wire types for `/api/auth/*` and `/api/leaderboard` — mirrors the backend session's finalized
// contract (2026-09-04, updated for the rating-by-time-control split per backlog/03-rating-by-time-
// control.md). Field names follow this repo's convention: camelCase properties.

import type { RoomResponse } from './types'

/** One time-control category's rating bucket. `category` is a `TimeControlCategory` name —
 *  `"Bullet"`/`"Blitz"`/`"Rapid"`/`"Daily"`/`"Untimed"`. */
export interface RatingBucket {
  category: string
  rating: number
  gamesPlayed: number
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  /** Always exactly 5 entries, one per `TimeControlCategory`, even at the 1200/0 default. */
  ratings: RatingBucket[]
  /** One of the fixed 8 preset ids (see `components/Avatar.tsx`'s `AVATAR_IDS`), or null/unset
   *  for the initial-letter fallback. Optional here (rather than required-but-nullable) purely
   *  so the many existing test fixtures built before this field existed keep compiling — treat
   *  a missing key exactly like `null` everywhere it's read. */
  avatarId?: string | null
  /** True for an admin account — the frontend uses it to show and guard the `/admin` area. It
   *  only ever flips via the admin API. Optional here (rather than required) for the same
   *  fixture-compat reason as `avatarId`; treat a missing key as `false`. */
  isAdmin?: boolean
}

export interface AuthTokens {
  /** JWT, 15 minute lifetime. */
  accessToken: string
  accessTokenExpiresAtUtc: string
  /** Opaque random string (not a JWT), body transport only — no cookie. 30 day lifetime. */
  refreshToken: string
  refreshTokenExpiresAtUtc: string
}

export interface AuthResponse extends AuthTokens {
  user: UserProfile
}

export interface LeaderboardEntry {
  userId: string
  displayName: string
  rating: number
  ratedGamesPlayed: number
}

/**
 * Friend-system wire types (`backlog/06-friend-invites-friendships.md`). `discriminator` is the
 * Discord-style 4-digit disambiguator on `(DisplayName, Discriminator)` — it only ever renders
 * alongside `displayName` on `FriendsPage`'s search/list rows (`DisplayName#nnnn`), never appended
 * to a player's name in-game, on the leaderboard, or anywhere else `displayName` already shows up.
 */
export interface UserSearchResult {
  id: string
  displayName: string
  discriminator: string
  avatarId: string | null
}

/** One row of `GET /api/friends` — an accepted friendship. */
export interface FriendSummary {
  userId: string
  displayName: string
  discriminator: string
  avatarId: string | null
}

/** One row of `GET /api/friends/requests/incoming|outgoing` — a still-pending request. */
export interface FriendRequestSummary {
  requestId: string
  userId: string
  displayName: string
  discriminator: string
  avatarId: string | null
  createdAtUtc: string
}

/** Response of `POST /api/friends/requests` — see `sendFriendRequest`'s doc comment for the
 *  implicit-accept case that returns `"accepted"` instead of creating a new pending row. */
export interface SendFriendRequestResponse {
  status: 'pending' | 'accepted'
}

/**
 * Match-invite wire types (`backlog/07-friend-invites-matches.md`). A `MatchInvite` is a proposal
 * to play — no `Game` row exists until the invitee calls `acceptInvite`, at which point the
 * response reuses the room's own `RoomResponse` shape (`api/types.ts`).
 */
export interface MatchInviteResponse {
  id: string
  expiresAtUtc: string
}

/** One row of `GET /api/invites/pending` — the fallback list a client reconciles against on
 *  load or after an `inviteReceived` push, since the push payload itself carries only an id
 *  (never trusted as authoritative content — same discipline as every other hub event). */
export interface PendingInvite {
  id: string
  inviterId: string
  inviterDisplayName: string
  inviterDiscriminator: string
  inviterAvatarId: string | null
  ruleset: string
  layout: string
  timeControl: string | null
  rated: boolean
  createdAtUtc: string
  expiresAtUtc: string
}

/** One row of `GET /api/invites/sent` — the caller's own not-yet-consumed sent invites (never
 *  "Declined"/"Expired", nothing left to recover there). The REST fallback for the "waiting for
 *  them to accept" screen: the `inviteAccepted` hub push has no replay, so a missed one (dropped
 *  connection, or the tab having reloaded since sending) is otherwise unrecoverable. `room` is
 *  populated, in the caller's own seat, once `status` is `"Accepted"`. */
export interface SentInvite {
  id: string
  status: 'Pending' | 'Accepted'
  room: RoomResponse | null
}
