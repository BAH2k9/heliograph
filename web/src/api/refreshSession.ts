import { refresh as apiRefresh } from './authClient'
import type { AuthResponse } from './authTypes'

/**
 * Dedups concurrent refresh attempts against a single, rotating, single-use refresh token.
 * `authFetch`'s 401 handling and `authStore.hydrate`'s boot-time refresh both call this — without
 * a shared lock, a page load that fires an API call immediately (e.g. `/profile` mounting
 * `listMyGames`) races hydrate's own refresh, the token gets rotated by whichever wins, and the
 * loser's refresh call fails with the now-stale token.
 *
 * Deliberately doesn't touch the auth store itself (no logout-on-failure, no `setSession`) — the
 * two callers want different failure behavior (authFetch forces a logout; hydrate stays quiet),
 * so that decision stays with them.
 */
let inFlight: Promise<AuthResponse> | null = null

export function refreshSession(refreshToken: string): Promise<AuthResponse> {
  inFlight ??= apiRefresh(refreshToken).finally(() => {
    inFlight = null
  })
  return inFlight
}
