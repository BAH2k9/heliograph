import { ApiError, readError } from './client'
import { authFetch } from './authFetch'
import type { GameEndedEvent } from './types'
import type {
  AdminCreateUserRequest,
  AdminForceEndRequest,
  AdminGameListResponse,
  AdminPatchUserRequest,
  AdminRevokeSessionsResponse,
  AdminRoomCleanupRequest,
  AdminRoomCleanupResponse,
  AdminSetPasswordRequest,
  AdminSetRatingRequest,
  AdminStats,
  AdminUserListResponse,
  AdminUserRow,
} from './adminTypes'

/**
 * Calls against `/api/admin/*`. The whole controller is `[Authorize(Policy = "Admin")]`, so every
 * call goes through `authFetch` (bearer token + one 401 refresh-retry) exactly like `client.ts`.
 * A 403 means "valid session, not an admin"; a 401 means "no/expired session past what refresh
 * recovers" — both surface as an `ApiError` the caller renders. 4xx bodies are `{ error }`
 * (`AdminError`), which `readError` already unwraps.
 */

const BASE = '/api/admin'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${BASE}${path}`, init)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as T
}

async function noContent(path: string, init: RequestInit): Promise<void> {
  const res = await authFetch(`${BASE}${path}`, init)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
}

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

// ---- users ---------------------------------------------------------------------------------

export interface ListUsersParams {
  search?: string
  page?: number
  pageSize?: number
}

export async function listUsers(params: ListUsersParams = {}): Promise<AdminUserListResponse> {
  const q = new URLSearchParams()
  if (params.search) q.set('search', params.search)
  if (params.page) q.set('page', String(params.page))
  if (params.pageSize) q.set('pageSize', String(params.pageSize))
  const suffix = q.toString() ? `?${q}` : ''
  return json<AdminUserListResponse>(`/users${suffix}`)
}

export async function getUser(id: string): Promise<AdminUserRow> {
  return json<AdminUserRow>(`/users/${encodeURIComponent(id)}`)
}

export async function createUser(body: AdminCreateUserRequest): Promise<AdminUserRow> {
  return json<AdminUserRow>('/users', post(body))
}

export async function patchUser(id: string, body: AdminPatchUserRequest): Promise<AdminUserRow> {
  return json<AdminUserRow>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteUser(id: string): Promise<void> {
  return noContent(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function setPassword(id: string, body: AdminSetPasswordRequest): Promise<void> {
  return noContent(`/users/${encodeURIComponent(id)}/password`, post(body))
}

export async function revokeSessions(id: string): Promise<AdminRevokeSessionsResponse> {
  return json<AdminRevokeSessionsResponse>(`/users/${encodeURIComponent(id)}/revoke-sessions`, post({}))
}

export async function setRating(id: string, body: AdminSetRatingRequest): Promise<AdminUserRow> {
  return json<AdminUserRow>(`/users/${encodeURIComponent(id)}/rating`, post(body))
}

// ---- games / rooms ----------------------------------------------------------------------

export interface ListGamesParams {
  status?: string
  rated?: boolean
  rooms?: boolean
  page?: number
  pageSize?: number
}

export async function listGames(params: ListGamesParams = {}): Promise<AdminGameListResponse> {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.rated !== undefined) q.set('rated', String(params.rated))
  if (params.rooms !== undefined) q.set('rooms', String(params.rooms))
  if (params.page) q.set('page', String(params.page))
  if (params.pageSize) q.set('pageSize', String(params.pageSize))
  const suffix = q.toString() ? `?${q}` : ''
  return json<AdminGameListResponse>(`/games${suffix}`)
}

export async function deleteGame(id: string): Promise<void> {
  return noContent(`/games/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function forceEndGame(id: string, body: AdminForceEndRequest): Promise<GameEndedEvent> {
  return json<GameEndedEvent>(`/games/${encodeURIComponent(id)}/force-end`, post(body))
}

export async function cleanupRooms(body: AdminRoomCleanupRequest): Promise<AdminRoomCleanupResponse> {
  return json<AdminRoomCleanupResponse>('/rooms/cleanup', post(body))
}

// ---- stats ----------------------------------------------------------------------------------

export async function getStats(): Promise<AdminStats> {
  return json<AdminStats>('/stats')
}
