// Wire types for `/api/auth/*` and `/api/leaderboard` — mirrors the backend session's finalized
// contract (2026-09-04). Field names follow this repo's convention: camelCase properties.

export interface UserProfile {
  id: string
  email: string
  displayName: string
  rating: number
  ratedGamesPlayed: number
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
