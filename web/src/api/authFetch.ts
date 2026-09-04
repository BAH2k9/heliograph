import { useAuth } from '../authStore'
import { refreshSession } from './refreshSession'

/** Never retry-on-401 for the refresh call itself — a dead refresh token would loop forever. */
const REFRESH_PATH = '/api/auth/refresh'

// Shared by every concurrent 401 so a batch of in-flight requests triggers exactly one refresh
// call, not one per request (important once a refresh token is single-use/rotating).
let refreshInFlight: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  const { refreshToken } = useAuth.getState()
  if (!refreshToken) return false
  try {
    const res = await refreshSession(refreshToken)
    useAuth.getState().setSession(res)
    return true
  } catch {
    useAuth.getState().logout()
    return false
  }
}

async function ensureRefreshed(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

function withAuthHeader(init: RequestInit): RequestInit {
  const token = useAuth.getState().accessToken
  if (!token) return init
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

/**
 * Drop-in replacement for `fetch`, used by every `/api/*` call in `api/client.ts`. Attaches the
 * access token when logged in — a no-op for guest play, since no token means no header and the
 * request goes through exactly as it does today. On a 401, refreshes once and retries; a failed
 * refresh forces logout and returns the original 401 so the caller's existing error handling
 * (e.g. `submitMove`'s `{ ok: false }` branch) takes over unchanged.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, withAuthHeader(init))
  if (res.status !== 401 || input === REFRESH_PATH) return res

  const refreshed = await ensureRefreshed()
  if (!refreshed) return res

  return fetch(input, withAuthHeader(init))
}
