import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameArchivePage } from './GameArchivePage'
import type { GameSummary } from '../api/types'

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
        moveCount: 12,
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    render(<GameArchivePage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    expect(await screen.findByText('Classic · Imhotep')).toBeInTheDocument()
    expect(screen.getByText('5m 30s')).toBeInTheDocument()
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
        moveCount: 3,
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    render(<GameArchivePage />)
    expect(await screen.findByText('Khet 2.0')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('shows an empty state when there are no games', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<GameArchivePage />)
    expect(await screen.findByText(/No games yet/)).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'db unavailable' }, 500)))

    render(<GameArchivePage />)
    expect(await screen.findByText(/Couldn't load games: db unavailable/)).toBeInTheDocument()
  })
})
