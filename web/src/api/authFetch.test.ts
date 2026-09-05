import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authFetch } from './authFetch'
import { useAuth } from '../authStore'
import * as authClient from './authClient'
import type { AuthResponse, UserProfile } from './authTypes'
import { defaultRatings } from '../test/authFixtures'

const initialAuthState = useAuth.getState()

const user: UserProfile = { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() }

function authResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    accessToken: 'fresh',
    accessTokenExpiresAtUtc: '2026-09-04T19:00:00Z',
    refreshToken: 'r2',
    refreshTokenExpiresAtUtc: '2026-10-04T18:00:00Z',
    user,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  useAuth.setState(initialAuthState, true)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authFetch', () => {
  it('sends no Authorization header for guest play', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/games')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
  })

  it('attaches the access token when logged in', async () => {
    useAuth.setState({ accessToken: 'tok123' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/games')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tok123')
  })

  it('refreshes once on a 401 and retries with the new token', async () => {
    useAuth.setState({ accessToken: 'stale', refreshToken: 'r1' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(authClient, 'refresh').mockResolvedValue(authResponse())

    const res = await authFetch('/api/games')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit | undefined]
    expect(new Headers(retryInit?.headers).get('authorization')).toBe('Bearer fresh')
    expect(useAuth.getState().accessToken).toBe('fresh')
    expect(useAuth.getState().refreshToken).toBe('r2')
  })

  it('forces logout and returns the original 401 when refresh fails', async () => {
    useAuth.setState({ accessToken: 'stale', refreshToken: 'r1', user })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(authClient, 'refresh').mockRejectedValue(new Error('expired'))
    // logout() best-effort-revokes via authClient.logout, a separate call this test isn't about.
    vi.spyOn(authClient, 'logout').mockResolvedValue(undefined)

    const res = await authFetch('/api/games')

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuth.getState().accessToken).toBeNull()
    expect(useAuth.getState().user).toBeNull()
  })

  it('does not attempt a refresh on a 401 with no refresh token (guest play)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))
    vi.stubGlobal('fetch', fetchMock)
    const refreshSpy = vi.spyOn(authClient, 'refresh')

    const res = await authFetch('/api/games')

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('never retries the refresh endpoint itself, even on a 401', async () => {
    useAuth.setState({ refreshToken: 'r1' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))
    vi.stubGlobal('fetch', fetchMock)
    const refreshSpy = vi.spyOn(authClient, 'refresh')

    const res = await authFetch('/api/auth/refresh', { method: 'POST' })

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('shares one refresh call across concurrent 401s', async () => {
    useAuth.setState({ accessToken: 'stale', refreshToken: 'r1' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))
    vi.stubGlobal('fetch', fetchMock)
    let resolveRefresh: (v: AuthResponse) => void = () => {}
    const pending = new Promise<AuthResponse>((resolve) => {
      resolveRefresh = resolve
    })
    const refreshSpy = vi.spyOn(authClient, 'refresh').mockReturnValue(pending)

    const p1 = authFetch('/api/games')
    const p2 = authFetch('/api/rooms')
    await Promise.resolve()
    await Promise.resolve()
    resolveRefresh(authResponse())
    await Promise.all([p1, p2])

    expect(refreshSpy).toHaveBeenCalledTimes(1)
  })

  it('shares one refresh call with a concurrent authStore.hydrate() boot refresh', async () => {
    // The scenario the shared refreshSession lock exists for: a page mounts and immediately
    // fires both an API call (which 401s on a stale token) and the boot-time hydrate refresh.
    useAuth.setState({ accessToken: 'stale', refreshToken: 'r1' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const refreshSpy = vi.spyOn(authClient, 'refresh').mockResolvedValue(authResponse())

    await Promise.all([authFetch('/api/games'), useAuth.getState().hydrate()])

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(useAuth.getState().accessToken).toBe('fresh')
  })
})
