import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameArchivePage } from './GameArchivePage'
import type { GameSummary } from '../api/types'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/archive']}>
      <Routes>
        <Route path="/archive" element={<GameArchivePage />} />
        <Route path="/replay/:gameId" element={<p>replay stub</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GameArchivePage', () => {
  it('shows a loading state, then the table once games arrive', async () => {
    const games: GameSummary[] = [
      {
        id: 'g1',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: '2026-09-04T18:05:30Z',
        status: 'P1Win',
        ruleset: 'Classic',
        layout: 'Imhotep',
        rated: false,
        moveCount: 12,
        endReason: 'Pharaoh',
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    expect(await screen.findByText('Classic · Imhotep')).toBeInTheDocument()
    expect(screen.getByText('5m 30s')).toBeInTheDocument()
    // An ordinary Pharaoh-elimination win gets no "by timeout" qualifier.
    expect(screen.getByText('Silver (P1) wins')).toBeInTheDocument()
  })

  it('shows a "by timeout" qualifier next to the result when endReason is Timeout', async () => {
    const games: GameSummary[] = [
      {
        id: 'g4',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: '2026-09-04T18:05:30Z',
        status: 'P2Win',
        ruleset: 'Classic',
        layout: 'Classic',
        rated: false,
        moveCount: 20,
        endReason: 'Timeout',
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()
    expect(await screen.findByText('Red (P2) wins · by timeout')).toBeInTheDocument()
  })

  it('shows a "by abandonment" qualifier next to the result when endReason is Abandonment', async () => {
    const games: GameSummary[] = [
      {
        id: 'g5',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: '2026-09-04T18:05:30Z',
        status: 'P1Win',
        ruleset: 'Classic',
        layout: 'Classic',
        rated: false,
        moveCount: 8,
        endReason: 'Abandonment',
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()
    expect(await screen.findByText('Silver (P1) wins · by abandonment')).toBeInTheDocument()
  })

  it('shows a "by resignation" qualifier next to the result when endReason is Resignation', async () => {
    const games: GameSummary[] = [
      {
        id: 'g6',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: '2026-09-04T18:05:30Z',
        status: 'P1Win',
        ruleset: 'Classic',
        layout: 'Classic',
        rated: false,
        moveCount: 9,
        endReason: 'Resignation',
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()
    expect(await screen.findByText('Silver (P1) wins · by resignation')).toBeInTheDocument()
  })

  it('shows "In progress" for a game with no finishedAtUtc', async () => {
    const games: GameSummary[] = [
      {
        id: 'g2',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: null,
        status: 'InProgress',
        ruleset: 'Khet2',
        layout: 'Khet2Classic',
        rated: false,
        moveCount: 3,
        endReason: null,
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()
    expect(await screen.findByText('Khet 2.0')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('shows an empty state when there are no games', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    renderPage()
    expect(await screen.findByText(/No games yet/)).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'db unavailable' }, 500)))

    renderPage()
    expect(await screen.findByText(/Couldn't load games: db unavailable/)).toBeInTheDocument()
  })

  it('clicking a row navigates to its replay screen', async () => {
    const games: GameSummary[] = [
      {
        id: 'g3',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: null,
        status: 'InProgress',
        ruleset: 'Classic',
        layout: 'Classic',
        rated: false,
        moveCount: 1,
        endReason: null,
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()
    fireEvent.click(await screen.findByText('Classic'))
    expect(await screen.findByText('replay stub')).toBeInTheDocument()
  })
})
