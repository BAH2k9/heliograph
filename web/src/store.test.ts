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
    p1Profile: null,
    p2Profile: null,
    timeControl: null,
    p1RemainingMs: null,
    p2RemainingMs: null,
    turnStartedAtUtc: null,
    turnDeadlineUtc: null,
    serverNowUtc: new Date().toISOString(),
    timedOut: false,
    endReason: null,
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

  it('a fresh load of a game still in progress clears any endReason left over from a previous game', async () => {
    useGame.setState({ endReason: 'Timeout' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(gameFixture({ status: 'InProgress', endReason: null }))))

    await useGame.getState().loadGame('g1')

    expect(useGame.getState().endReason).toBeNull()
  })

  // Sanity check requested alongside the EndReason GET field landing: a plain reload/resync of
  // an already-finished timed-out game must show the timeout result via this field directly —
  // not only via the in-memory gameEnded/409 state captured at the moment it happened. This is
  // exactly the case the 409-timeout optimization in `submit()` no longer has sole responsibility
  // for: GameResponse.endReason now gets there just as well, one request slower.
  it('loadGame/resync correctly show a timeout result from GameResponse.endReason alone, with no prior in-memory state', async () => {
    const finished = gameFixture({ status: 'P2Win', endReason: 'Timeout', timedOut: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(finished)))

    await useGame.getState().loadGame('g1')
    expect(useGame.getState().status).toBe('P2Win')
    expect(useGame.getState().endReason).toBe('Timeout')

    // Simulate a second client (or a page reload) that never saw the gameEnded push or the
    // 409 — resync is its only source of truth, and must land on the same answer.
    useGame.setState({ status: 'InProgress', endReason: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(finished)))
    await useGame.getState().resync()
    expect(useGame.getState().status).toBe('P2Win')
    expect(useGame.getState().endReason).toBe('Timeout')
  })

  it('a Pharaoh-elimination win is distinguishable from a timeout win via endReason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(gameFixture({ status: 'P1Win', endReason: 'Pharaoh' }))),
    )

    await useGame.getState().loadGame('g1')

    expect(useGame.getState().endReason).toBe('Pharaoh')
  })
})

describe('useGame passes the local seat into the hub Join invocation', () => {
  it('passes the seated player\'s seat to followGame', async () => {
    const { followGame } = await import('./realtime')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(gameFixture())))

    await useGame.getState().loadGame('g1', 'P1')

    expect(vi.mocked(followGame)).toHaveBeenCalledWith(
      'g1',
      'P1',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('passes a spectator\'s seat (null seat state) to followGame too', async () => {
    const { followGame } = await import('./realtime')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(gameFixture())))

    await useGame.getState().loadGame('g1')

    expect(vi.mocked(followGame)).toHaveBeenCalledWith(
      'g1',
      null,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    )
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

describe('useGame.applyOpponentDisconnected / applyOpponentReconnected', () => {
  it('stamps the disconnected seat, leaving the other seat untouched', () => {
    useGame.setState({ p1DisconnectedAtUtc: null, p2DisconnectedAtUtc: null })

    useGame.getState().applyOpponentDisconnected({ seat: 'P2', disconnectedAtUtc: '2026-01-01T00:00:05.000Z' })

    const s = useGame.getState()
    expect(s.p2DisconnectedAtUtc).toBe('2026-01-01T00:00:05.000Z')
    expect(s.p1DisconnectedAtUtc).toBeNull()
  })

  it('clears that seat’s disconnected timestamp on reconnect', () => {
    useGame.setState({ p1DisconnectedAtUtc: null, p2DisconnectedAtUtc: '2026-01-01T00:00:05.000Z' })

    useGame.getState().applyOpponentReconnected({ seat: 'P2' })

    expect(useGame.getState().p2DisconnectedAtUtc).toBeNull()
  })

  it('a fresh loadGame clears any leftover disconnect state from a previous game', async () => {
    useGame.setState({ p1DisconnectedAtUtc: '2026-01-01T00:00:05.000Z' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(gameFixture())))

    await useGame.getState().loadGame('g1')

    expect(useGame.getState().p1DisconnectedAtUtc).toBeNull()
  })
})

describe('useGame.claimAbandonment', () => {
  it('calls the claim-abandonment endpoint with the caller’s own seat', async () => {
    useGame.setState({ gameId: 'g1', seat: 'P1' })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ gameId: 'g1', status: 'P1Win', endReason: 'Abandonment', serverNowUtc: new Date().toISOString() }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().claimAbandonment()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/g1/claim-abandonment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ seat: 'P1' }),
      }),
    )
  })

  it('swallows a 409 (not disconnected long enough, or already resolved) without throwing', async () => {
    useGame.setState({ gameId: 'g1', seat: 'P1' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'opponent is not disconnected' }, 409)))

    await expect(useGame.getState().claimAbandonment()).resolves.toBeUndefined()
  })

  it('does nothing without an active game', async () => {
    useGame.setState({ gameId: null, seat: 'P1' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().claimAbandonment()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing for a spectator (no seat of its own to claim with)', async () => {
    useGame.setState({ gameId: 'g1', seat: 'Spectator' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().claimAbandonment()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useGame.resign', () => {
  it('calls the resign endpoint for the local seat', async () => {
    useGame.setState({ gameId: 'g1', seat: 'P1' })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ gameId: 'g1', status: 'P2Win', endReason: 'Resignation', serverNowUtc: new Date().toISOString() }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().resign()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/g1/resign',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ seat: 'P1' }),
      }),
    )
  })

  it('does not throw on failure, but sets an error (unlike claimTimeout, this is a deliberate click)', async () => {
    useGame.setState({ gameId: 'g1', seat: 'P2' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'game is already finished' }, 409)))

    await expect(useGame.getState().resign()).resolves.toBeUndefined()
    expect(useGame.getState().error).toMatch(/already finished/)
  })

  it('does nothing without an active game', async () => {
    useGame.setState({ gameId: null, seat: 'P1' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().resign()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing for a spectator (no seat to resign)', async () => {
    useGame.setState({ gameId: 'g1', seat: 'Spectator' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().resign()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useGame move submission rejected by an expired clock', () => {
  // POST /api/games/{id}/moves can 409 with a superset of the plain { error } shape when the
  // move arrived after the mover's clock had already expired: { error, status, endReason,
  // serverNowUtc } — the game ends as a side effect of the rejected submission. The store should
  // apply that outcome directly (like a `gameEnded` push) instead of a wasted full reload, and
  // must not lose `endReason` the way a plain `loadGame()` would (GameResponse has no such field).
  function seatedForMove() {
    useGame.setState({
      gameId: 'g1',
      board: { rows: 8, cols: 10, pieces: [] },
      seat: null,
      turn: 'P1',
      status: 'InProgress',
      selected: { row: 0, col: 0 },
      endReason: null,
    })
  }

  it('applies the gameEnded outcome from the 409 body without a follow-up GET', async () => {
    seatedForMove()
    const serverNowUtc = new Date(Date.now() + 1_000).toISOString()
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'move rejected: clock expired', status: 'P2Win', endReason: 'Timeout', serverNowUtc }, 409),
    )
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().moveTo({ row: 0, col: 1 })

    const s = useGame.getState()
    expect(s.status).toBe('P2Win')
    expect(s.endReason).toBe('Timeout')
    expect(s.serverOffsetMs).toBe(1_000)
    expect(s.error).toBe('move rejected: clock expired')
    expect(s.busy).toBe(false)
    expect(s.selected).toBeNull()
    // Only the moves POST happened — no follow-up GET/resync.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to a full reload for an ordinary rejection with no clock fields in the body', async () => {
    seatedForMove()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.endsWith('/moves')) {
        return Promise.resolve(jsonResponse({ error: 'illegal move' }, 400))
      }
      return Promise.resolve(jsonResponse(gameFixture()))
    })
    vi.stubGlobal('fetch', fetchMock)

    await useGame.getState().moveTo({ row: 0, col: 1 })

    expect(useGame.getState().error).toBe('illegal move')
    expect(useGame.getState().endReason).toBeNull()
    // The moves POST, then a follow-up GET reload — the ordinary (non-clock) rejection path.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
