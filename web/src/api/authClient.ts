import { ApiError, readError } from './client'
import { authFetch } from './authFetch'
import type { AuthResponse, LeaderboardEntry, UserProfile } from './authTypes'

/**
 * Calls against `/api/auth/*` and `/api/leaderboard`. There's no `register` here — accounts are
 * admin-created only (`POST /api/admin/users`, see `AuthController`'s doc comment); `login`/
 * `refresh` attach no bearer token since none exists yet, `logout` authenticates via the refresh
 * token in its body. `getLeaderboard` and `updateProfile` are `[Authorize]`d server-side, so they
 * go through `authFetch` (attaches the bearer token, retries once through a 401 refresh) like every
 * `/api/games/*` call in `client.ts` does.
 */

const BASE = '/api/auth'

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as T
}

/** `login` is an email or a display name. It's sent as `email` because that's the wire field's
 *  name: it predates display-name login and was kept so cached PWA builds don't break (see
 *  `LoginRequest` in `Heliograph.Contracts`). */
export async function login(login: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/login', { email: login, password })
}

/** Rotates the refresh token — the old one is revoked server-side, so callers must store the new one. */
export async function refresh(refreshToken: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/refresh', { refreshToken })
}

/** Revokes the refresh token server-side. Never throws — a logout must always succeed client-side. */
export async function logout(refreshToken: string): Promise<void> {
  try {
    await fetch(`${BASE}/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    /* best-effort; the client-side session is cleared regardless */
  }
}

/** `category` is required server-side (`TimeControlCategory` name) — there's no longer a single
 *  unqualified leaderboard. `authFetch`, not bare `fetch`: the endpoint is `[Authorize]`d (it used
 *  to be the app's one anonymous read), so an unauthenticated call now 401s. */
export async function getLeaderboard(category: string, top = 50): Promise<LeaderboardEntry[]> {
  const res = await authFetch(`/api/leaderboard?category=${category}&top=${top}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as LeaderboardEntry[]
}

/** Both fields optional/independent — send just the one being changed. `avatarId` must be one of
 *  the fixed 8 preset ids (400 `"unknown avatar '...'"` otherwise); `displayName`, if sent, must
 *  be non-empty/non-whitespace (400 otherwise). */
export interface UpdateProfileRequest {
  displayName?: string
  avatarId?: string
}

/** `PATCH /api/auth/me` — updates the logged-in account's display name and/or avatar, returning
 *  the same `UserProfile` shape `GET /api/auth/me` does. 401 if the access token is missing/expired
 *  past what `authFetch`'s refresh-and-retry can recover. */
export async function updateProfile(patch: UpdateProfileRequest): Promise<UserProfile> {
  const res = await authFetch(`${BASE}/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as UserProfile
}
