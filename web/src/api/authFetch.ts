import { useAuth } from '../authStore'
import { pushRingEntry, randomTraceId } from '../diagnostics'
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

/** Stamps the given `X-Trace-Id` onto the request. */
function withTraceId(init: RequestInit, traceId: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('X-Trace-Id', traceId)
  return { ...init, headers }
}

/**
 * Drop-in replacement for `fetch`, used by every `/api/*` call in `api/client.ts`. Attaches the
 * access token when logged in — a no-op for guest play, since no token means no header and the
 * request goes through exactly as it does today. On a 401, refreshes once and retries; a failed
 * refresh forces logout and returns the original 401 so the caller's existing error handling
 * (e.g. `submitMove`'s `{ ok: false }` branch) takes over unchanged.
 *
 * Mints one `randomTraceId()` `X-Trace-Id` per call — the primary correlation key for
 * anything with an HTTP request behind it (see `backlog/10-bug-traceability.md`'s wire contract) —
 * and pushes one ring-buffer entry per *actual fetch attempt*. A 401-then-retry therefore
 * produces two entries sharing the same trace id, not one, so a retried call doesn't read as a
 * duplicate submit in the reconstructed log.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const traceId = randomTraceId()
  const res = await fetch(input, withTraceId(withAuthHeader(init), traceId))
  pushRingEntry({ kind: 'rest', label: `${input} ${res.status}`, detail: { traceId, status: res.status } })
  if (res.status !== 401 || input === REFRESH_PATH) return res

  const refreshed = await ensureRefreshed()
  if (!refreshed) return res

  const retryRes = await fetch(input, withTraceId(withAuthHeader(init), traceId))
  pushRingEntry({
    kind: 'rest',
    label: `${input} ${retryRes.status} (retry)`,
    detail: { traceId, status: retryRes.status },
  })
  return retryRes
}
