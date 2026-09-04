import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeaderboardPage } from './LeaderboardPage'
import type { LeaderboardEntry } from '../api/authTypes'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LeaderboardPage', () => {
  it('shows a loading state, then the table once entries arrive', async () => {
    const entries: LeaderboardEntry[] = [{ userId: 'u1', displayName: 'Ana', rating: 1400, ratedGamesPlayed: 10 }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(entries)))

    render(<LeaderboardPage />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('1400')).toBeInTheDocument()
  })

  it('shows an empty state when no one has played a rated game', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<LeaderboardPage />)
    expect(await screen.findByText('No rated games played yet.')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'db unavailable' }, 500)))

    render(<LeaderboardPage />)
    expect(await screen.findByText(/Couldn't load the leaderboard: db unavailable/)).toBeInTheDocument()
  })
})
