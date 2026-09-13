import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { type BugReportBody, reportBug } from './reportBug'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const body: BugReportBody = {
  seat: 'P1',
  connectionId: 'conn-1',
  moveCount: 3,
  turn: 'P2',
  status: 'InProgress',
  serverOffsetMs: 12,
  lastTraceId: 'trace-1',
  clientCapturedAtUtc: '2026-09-13T00:00:00Z',
  bundle: { some: 'data' },
}

afterEach(() => vi.unstubAllGlobals())

describe('reportBug', () => {
  it('posts to the correct URL with the given body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'r1', receivedAtUtc: '2026-09-13T00:00:01Z' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    const ack = await reportBug('game-1', body)

    expect(ack).toEqual({ id: 'r1', receivedAtUtc: '2026-09-13T00:00:01Z' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/games/game-1/bug-reports')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
  })

  it('throws an ApiError carrying the server error detail on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'no game with id x' }, 404)))

    const err = await reportBug('missing', body).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).detail).toBe('no game with id x')
  })
})
