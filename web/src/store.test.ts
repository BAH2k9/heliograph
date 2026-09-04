import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameResponse } from './api/types'

// Isolate these tests from the real SignalR connection `loadGame`/`newGame`/`resync` kick off as
// a side effect (`startFollowing`) — irrelevant to clock snapping and just adds network noise.
vi.mock('./realtime', () => ({
  followGame: vi.fn().mockResolvedValue(undefined),
  unfollow: vi.fn().mockResolvedValue(undefined),
}))

const { useGame } = await import('./store')

const initialGameState = useGame.getState()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function gameFixture(overrides: Partial<GameResponse> = {}): GameResponse {
  return {
    id: 'g1',
    status: 'InProgress',
    currentTurn: 'P1',
    moveCount: 0,
    boardState: { rows: 8, cols: 10, pieces: [] },
    ruleset: 'Classic',
    layout: 'Classic',
    rated: false,
    p1Claimed: false,
    p2Claimed: false,
    timeControl: null,
    p1RemainingMs: null,
    p2RemainingMs: null,
    turnStartedAtUtc: null,
    turnDeadlineUtc: null,
    serverNowUtc: new Date().toISOString(),
    timedOut: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  useGame.setState(initialGameState, true)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useGame clock snapping', () => {
  it('loadGame snaps timeControl/remaining/deadline fields and computes serverOffsetMs from serverNowUtc', async () => {
    const serverNowUtc = new Date(Date.now() + 5_000).toISOString() // server clock 5s ahead
    const game = gameFixture({
      timeControl: '3+2',
      p1RemainingMs: 100_000,
      p2RemainingMs: 90_000,
      turnStartedAtUtc: new Date(Date.now() - 1_000).toISOString(),
      turnDeadlineUtc: new Date(Date.now() + 99_000).toISOString(),
      serverNowUtc,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(game)))

    await useGame.getState().loadGame('g1')

    const s = useGame.getState()
    expect(s.timeControl).toBe('3+2')
    expect(s.p1RemainingMs).toBe(100_000)
    expect(s.p2RemainingMs).toBe(90_000)
    expect(s.turnDeadlineUtc).toBe(game.turnDeadlineUtc)
    expect(s.serverOffsetMs).toBe(5_000)
  })

  it('resync re-snaps clock fields from a fresh payload', async () => {
    useGame.setState({ gameId: 'g1', timeControl: '3+2', p1RemainingMs: 100_000, serverOffsetMs: 0 })
    const game = gameFixture({
      timeControl: '3+2',
      p1RemainingMs: 40_000,
      p2RemainingMs: 90_000,
      turnDeadlineUtc: new Date(Date.now() + 40_000).toISOString(),
      serverNowUtc: new Date(Date.now() - 2_000).toISOString(), // server clock 2s behind
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(game)))

    await useGame.getState().resync()

    const s = useGame.getState()
    expect(s.p1RemainingMs).toBe(40_000)
    expect(s.serverOffsetMs).toBe(-2_000)
  })

  it('a fresh load clears any endReason left over from a previous game', async () => {
    useGame.setState({ endReason: 'Timeout' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(gameFixture())))

    await useGame.getState().loadGame('g1')

    expect(useGame.getState().endReason).toBeNull()
  })
})

describe('useGame.applyGameEnded', () => {
  it('sets status/endReason and recomputes serverOffsetMs from the event', () => {
    useGame.setState({ gameId: 'g1', status: 'InProgress', endReason: null, serverOffsetMs: 0 })

    useGame.getState().applyGameEnded({
      status: 'P2Win',
      endReason: 'Timeout',
      serverNowUtc: new Date(Date.now() + 3_000).toISOString(),
    })

    const s = useGame.getState()
    expect(s.status).toBe('P2Win')
    expect(s.endReason).toBe('Timeout')
    expect(s.serverOffsetMs).toBe(3_000)
  })
})

describe('useGame.claimTimeout', () => {
  it('calls the claim-timeout endpoint for the current game', async () => {
    useGame.setState({ gameId: 'g1' })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ gameId: 'g1', status: 'P2Win', endReason: 'Timeout', serverNowUtc: new Date().toISOString() }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().claimTimeout()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/g1/claim-timeout',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('swallows a 409 (not actually expired yet, or already resolved) without throwing', async () => {
    useGame.setState({ gameId: 'g1' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'not expired' }, 409)))

    await expect(useGame.getState().claimTimeout()).resolves.toBeUndefined()
  })

  it('does nothing without an active game', async () => {
    useGame.setState({ gameId: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().claimTimeout()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
