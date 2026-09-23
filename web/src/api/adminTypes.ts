// Wire types for `/api/admin/*` — mirror `Heliograph.Contracts/AdminApi.cs`. Types only: the request
// functions (an `adminClient.ts` alongside `client.ts`) and the admin pages land in the separate
// frontend admin PR, once the design-system sweep is merged. camelCase properties, per repo
// convention; enum-valued fields are the backend's PascalCase strings.

import type { RatingBucket } from './authTypes'
import type { EndReason, GameStatus } from './types'

/** Body of every 4xx from `/api/admin/*`. */
export interface AdminError {
  error: string
}

/** One row of `GET /api/admin/users`. `activeSessionCount` = live (un-revoked, unexpired) refresh tokens. */
export interface AdminUserRow {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  isDisabled: boolean
  createdAtUtc: string
  /** Always exactly 4 entries, one per `TimeControlCategory`. */
  ratings: RatingBucket[]
  activeSessionCount: number
}

/** Body of `GET /api/admin/users`. `page` is 1-based. */
export interface AdminUserListResponse {
  users: AdminUserRow[]
  total: number
  page: number
  pageSize: number
}

/** Body of `POST /api/admin/users`. 409 on a duplicate email, 400 otherwise. */
export interface AdminCreateUserRequest {
  email: string
  password: string
  displayName: string
  isAdmin: boolean
}

/** Body of `PATCH /api/admin/users/{id}`. Every field optional; omitted → unchanged. Clearing
 *  your own admin flag, the last admin's, or disabling yourself is refused (400). */
export interface AdminPatchUserRequest {
  displayName?: string
  isAdmin?: boolean
  isDisabled?: boolean
}

/** Body of `POST /api/admin/users/{id}/password`. On success the target's live sessions are revoked. */
export interface AdminSetPasswordRequest {
  newPassword: string
}

/** Body of `POST /api/admin/users/{id}/rating`. `category` is a `TimeControlCategory` name; omit
 *  `gamesPlayed` to overwrite only the rating. */
export interface AdminSetRatingRequest {
  category: string
  rating: number
  gamesPlayed?: number
}

/** Body of `POST /api/admin/users/{id}/revoke-sessions` response. */
export interface AdminRevokeSessionsResponse {
  revoked: number
}

/** One row of `GET /api/admin/games`. `joinCode` non-null ⇒ the game is a room. Display names are
 *  null for an anonymous/empty seat. */
export interface AdminGameRow {
  id: string
  status: GameStatus
  endReason: EndReason | null
  ruleset: string
  layout: string
  timeControl: string | null
  rated: boolean
  moveCount: number
  seatsTaken: number
  joinCode: string | null
  p1UserId: string | null
  p1DisplayName: string | null
  p2UserId: string | null
  p2DisplayName: string | null
  createdAtUtc: string
  finishedAtUtc: string | null
}

/** Body of `GET /api/admin/games`. `page` is 1-based. */
export interface AdminGameListResponse {
  games: AdminGameRow[]
  total: number
  page: number
  pageSize: number
}

/** Body of `POST /api/admin/games/{id}/force-end`. `winner` is `"P1"` or `"P2"`. Sets
 *  `endReason = "Aborted"` and — unlike an organic ending — does not touch Elo. The response is
 *  a `GameEndedResponse` (also broadcast as `gameEnded`). */
export interface AdminForceEndRequest {
  winner: 'P1' | 'P2'
}

/** Body of `POST /api/admin/rooms/cleanup` — deletes stale unfilled rooms older than `olderThanHours`. */
export interface AdminRoomCleanupRequest {
  olderThanHours: number
}

export interface AdminRoomCleanupResponse {
  deletedCount: number
}

/** Body of `GET /api/admin/stats` — dashboard counts. */
export interface AdminStats {
  totalUsers: number
  adminCount: number
  disabledCount: number
  gamesInProgress: number
  gamesFinished: number
  openRooms: number
  ratedGames: number
}
