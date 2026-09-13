import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BugReportDialog } from './BugReportDialog'
import { resetRingBuffer } from '../diagnostics'
import { useGame } from '../store'

vi.mock('../realtime', () => ({
  getConnectionId: () => 'conn-xyz',
  followGame: vi.fn().mockResolvedValue(undefined),
  unfollow: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}))

const initialGameState = useGame.getState()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  useGame.setState(initialGameState, true)
  resetRingBuffer()
  vi.unstubAllGlobals()
})

describe('BugReportDialog', () => {
  it('submits a bundle with no auth-token keys, and with gameId/seat/moveCount present', async () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      turn: 'P2',
      status: 'InProgress',
      moveCount: 5,
      serverOffsetMs: 10,
      lastMoveApplied: null,
    })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'r1', receivedAtUtc: '2026-09-13T00:00:00Z' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    render(<BugReportDialog open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/games/g1/bug-reports')
    const sent = JSON.parse(init.body as string) as unknown

    const serialized = JSON.stringify(sent).toLowerCase()
    expect(serialized).not.toMatch(/accesstoken/)
    expect(serialized).not.toMatch(/refreshtoken/)
    // A loose "token" check would also catch "lasttraceid"/etc, so scope it to the literal word.
    expect(serialized).not.toMatch(/"token"/)

    expect(serialized).toContain('"gameid":"g1"')
    expect(serialized).toContain('"seat":"p1"')
    expect(serialized).toContain('"movecount":5')
  })

  it('does not serialize a live access token into the bundle', async () => {
    // Sanity check for the "never even redact a token" rule: set an access token in the auth
    // store and confirm it's simply absent from the request body (the header is a separate,
    // legitimate concern of authFetch, not the bundle).
    const { useAuth } = await import('../authStore')
    const initialAuth = useAuth.getState()
    useAuth.setState({ accessToken: 'super-secret-token' })
    try {
      useGame.setState({
        gameId: 'g2',
        seat: 'P2',
        turn: 'P1',
        status: 'InProgress',
        moveCount: 1,
        serverOffsetMs: 0,
        lastMoveApplied: null,
      })
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'r2', receivedAtUtc: '2026-09-13T00:00:00Z' }, 201))
      vi.stubGlobal('fetch', fetchMock)

      render(<BugReportDialog open onClose={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const sent = JSON.stringify(JSON.parse(init.body as string))
      expect(sent).not.toContain('super-secret-token')
    } finally {
      useAuth.setState(initialAuth, true)
    }
  })
})
