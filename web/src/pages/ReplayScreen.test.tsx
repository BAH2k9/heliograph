import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReplayScreen } from './ReplayScreen'
import type { GameHistoryResponse, GameResponse } from '../api/types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const game: GameResponse = {
  id: 'g1',
  status: 'P1Win',
  currentTurn: 'P2',
  moveCount: 1,
  boardState: { rows: 8, cols: 10, pieces: [{ row: 2, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NW', health: null }] },
  ruleset: 'Classic',
  layout: 'Dawn',
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
  serverNowUtc: '2026-09-04T18:00:00Z',
  timedOut: false,
  endReason: 'Pharaoh',
  botSeat: null,
  botDifficulty: null,
  rematchGameId: null,
  mySeat: null,
}

const history: GameHistoryResponse = {
  startingBoardState: {
    rows: 8,
    cols: 10,
    pieces: [{ row: 2, col: 3, kind: 'Pyramid', owner: 'P1', orientation: 'NW', health: null }],
  },
  moves: [
    {
      moveNumber: 1,
      player: 'P1',
      type: 'Move',
      from: { row: 2, col: 3 },
      to: { row: 2, col: 4 },
      rotation: null,
      laserResult: {
        firedBy: 'P1',
        emitter: { row: 7, col: 9, direction: 'Up' },
        termination: 'ExitedBoard',
        segments: [],
        hitCell: null,
        eliminated: [],
        damaged: [],
      },
      boardState: {
        rows: 8,
        cols: 10,
        pieces: [{ row: 2, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NW', health: null }],
      },
      createdAtUtc: '2026-09-04T18:00:05Z',
    },
  ],
}

function renderReplay() {
  return render(
    <MemoryRouter initialEntries={['/replay/g1']}>
      <Routes>
        <Route path="/replay/:gameId" element={<ReplayScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReplayScreen', () => {
  it('loads the game and defaults to the latest move', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(url.endsWith('/moves') ? jsonResponse(history) : jsonResponse(game)),
      ),
    )

    renderReplay()
    expect(await screen.findByText('Move 1 / 1')).toBeInTheDocument()
    expect(screen.getByText('Brass moved (3, 4) → (3, 5)')).toBeInTheDocument()
    expect(screen.getByText(/Brass \(P1\) won/)).toBeInTheDocument()
  })

  it('First / Previous step back to the starting position', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(url.endsWith('/moves') ? jsonResponse(history) : jsonResponse(game)),
      ),
    )

    renderReplay()
    await screen.findByText('Move 1 / 1')

    fireEvent.click(screen.getByRole('button', { name: 'First' }))
    expect(screen.getByText('Move 0 / 1')).toBeInTheDocument()
    expect(screen.getByText('Starting position')).toBeInTheDocument()
  })

  it('shows an error message when the game fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ error: 'no game with id g1' }, 404))),
    )

    renderReplay()
    expect(await screen.findByText(/Couldn't load this game: no game with id g1/)).toBeInTheDocument()
  })
})
