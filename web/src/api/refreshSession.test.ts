import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshSession } from './refreshSession'
import * as authClient from './authClient'
import type { AuthResponse } from './authTypes'
import { defaultRatings } from '../test/authFixtures'

function authResponse(): AuthResponse {
  return {
    accessToken: 'fresh',
    accessTokenExpiresAtUtc: '2026-09-04T19:00:00Z',
    refreshToken: 'r2',
    refreshTokenExpiresAtUtc: '2026-10-04T18:00:00Z',
    user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('refreshSession', () => {
  it('calls the API once and returns the result to every caller sharing the token', async () => {
    const refreshSpy = vi.spyOn(authClient, 'refresh').mockResolvedValue(authResponse())

    const [a, b] = await Promise.all([refreshSession('r1'), refreshSession('r1')])

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('allows a fresh refresh after the previous one has settled', async () => {
    const refreshSpy = vi.spyOn(authClient, 'refresh').mockResolvedValue(authResponse())

    await refreshSession('r1')
    await refreshSession('r2')

    expect(refreshSpy).toHaveBeenCalledTimes(2)
  })

  it('propagates a failure to every caller sharing the call', async () => {
    vi.spyOn(authClient, 'refresh').mockRejectedValue(new Error('expired'))

    const results = await Promise.allSettled([refreshSession('r1'), refreshSession('r1')])

    expect(results[0].status).toBe('rejected')
    expect(results[1].status).toBe('rejected')
  })
})
