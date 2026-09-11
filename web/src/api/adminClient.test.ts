import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { forceEndGame, getStats, listUsers } from './adminClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('adminClient', () => {
  it('parses a successful stats response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ totalUsers: 7, adminCount: 1 })))
    const stats = await getStats()
    expect(stats.totalUsers).toBe(7)
  })

  it('builds the query string for listUsers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ users: [], total: 0, page: 2, pageSize: 20 }))
    vi.stubGlobal('fetch', fetchMock)
    await listUsers({ search: 'ana b', page: 2 })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('search=ana+b')
    expect(url).toContain('page=2')
  })

  it('throws an ApiError carrying the server error detail on a 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'admin only' }, 403)))
    const err = await forceEndGame('g1', { winner: 'P1' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).detail).toBe('admin only')
  })
})
