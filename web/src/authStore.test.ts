import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './authStore'
import * as authClient from './api/authClient'
import type { AuthResponse, UserProfile } from './api/authTypes'
import { defaultRatings } from './test/authFixtures'

const initialState = useAuth.getState()

const user: UserProfile = { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() }

function authResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    accessToken: 'access-1',
    accessTokenExpiresAtUtc: '2026-09-04T19:00:00Z',
    refreshToken: 'refresh-1',
    refreshTokenExpiresAtUtc: '2026-10-04T18:00:00Z',
    user,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  useAuth.setState(initialState, true)
  vi.restoreAllMocks()
})

describe('useAuth', () => {
  it('login success stores the session and clears busy', async () => {
    vi.spyOn(authClient, 'login').mockResolvedValue(authResponse())

    const ok = await useAuth.getState().login('a@b.com', 'secret12')

    expect(ok).toBe(true)
    expect(useAuth.getState().accessToken).toBe('access-1')
    expect(useAuth.getState().refreshToken).toBe('refresh-1')
    expect(useAuth.getState().user).toEqual(user)
    expect(useAuth.getState().busy).toBe(false)
  })

  it('login failure sets an error and leaves the session empty', async () => {
    vi.spyOn(authClient, 'login').mockRejectedValue(new Error('invalid email or password'))

    const ok = await useAuth.getState().login('a@b.com', 'wrong')

    expect(ok).toBe(false)
    expect(useAuth.getState().error).toBe('invalid email or password')
    expect(useAuth.getState().user).toBeNull()
    expect(useAuth.getState().accessToken).toBeNull()
  })

  it('logout revokes the refresh token server-side and clears local state', () => {
    const logoutSpy = vi.spyOn(authClient, 'logout').mockResolvedValue(undefined)
    useAuth.setState({ accessToken: 'a1', refreshToken: 'r1', user })

    useAuth.getState().logout()

    expect(logoutSpy).toHaveBeenCalledWith('r1')
    expect(useAuth.getState().accessToken).toBeNull()
    expect(useAuth.getState().refreshToken).toBeNull()
    expect(useAuth.getState().user).toBeNull()
  })

  it('logout is a no-op against the server when there was no refresh token', () => {
    const logoutSpy = vi.spyOn(authClient, 'logout')
    useAuth.getState().logout()
    expect(logoutSpy).not.toHaveBeenCalled()
  })

  it('hydrate refreshes the session when a refresh token is persisted', async () => {
    useAuth.setState({ refreshToken: 'r1' })
    vi.spyOn(authClient, 'refresh').mockResolvedValue(authResponse({ accessToken: 'access-2' }))

    await useAuth.getState().hydrate()

    expect(useAuth.getState().accessToken).toBe('access-2')
  })

  it('hydrate no-ops without a persisted refresh token', async () => {
    const refreshSpy = vi.spyOn(authClient, 'refresh')
    await useAuth.getState().hydrate()
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('hydrate leaves the existing session alone if the refresh call fails', async () => {
    useAuth.setState({ refreshToken: 'r1', accessToken: 'stale', user })
    vi.spyOn(authClient, 'refresh').mockRejectedValue(new Error('expired'))

    await useAuth.getState().hydrate()

    expect(useAuth.getState().accessToken).toBe('stale')
    expect(useAuth.getState().user).toEqual(user)
  })

  it('updateProfile success replaces user with the server response', async () => {
    useAuth.setState({ accessToken: 'a1', user })
    const updated: UserProfile = { ...user, displayName: 'Ana2', avatarId: 'sphinx' }
    vi.spyOn(authClient, 'updateProfile').mockResolvedValue(updated)

    const ok = await useAuth.getState().updateProfile({ displayName: 'Ana2', avatarId: 'sphinx' })

    expect(ok).toBe(true)
    expect(useAuth.getState().user).toEqual(updated)
    expect(useAuth.getState().busy).toBe(false)
  })

  it('updateProfile failure (e.g. unknown avatar) sets an error and leaves user unchanged', async () => {
    useAuth.setState({ accessToken: 'a1', user })
    vi.spyOn(authClient, 'updateProfile').mockRejectedValue(new Error("unknown avatar 'nope'"))

    const ok = await useAuth.getState().updateProfile({ avatarId: 'nope' })

    expect(ok).toBe(false)
    expect(useAuth.getState().error).toBe("unknown avatar 'nope'")
    expect(useAuth.getState().user).toEqual(user)
  })
})
