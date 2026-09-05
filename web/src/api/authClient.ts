import { ApiError, readError } from './client'
import type { AuthResponse, LeaderboardEntry } from './authTypes'

/**
 * Calls against `/api/auth/*` and `/api/leaderboard`, per the backend session's contract
 * (2026-09-04). None of these attach a bearer token — `register`/`login`/`refresh` happen
 * before one exists, `logout` authenticates via the refresh token in its body, and the
 * leaderboard is unauthenticated (the login requirement is a client-side route guard only,
 * see `RequireAuth`).
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

export async function register(email: string, password: string, displayName: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/register', { email, password, displayName })
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>('/login', { email, password })
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
 *  unqualified leaderboard. */
export async function getLeaderboard(category: string, top = 50): Promise<LeaderboardEntry[]> {
  const res = await fetch(`/api/leaderboard?category=${category}&top=${top}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as LeaderboardEntry[]
}
