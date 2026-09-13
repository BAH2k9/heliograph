import { fireEvent, render, screen } from '@testing-library/react'
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

  it('defaults to the Blitz category on first load', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<LeaderboardPage />)
    await screen.findByText('No rated Blitz games played yet.')

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=Blitz'))
    expect(screen.getByRole('button', { name: 'Blitz' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switching category tabs refetches against the newly selected category', async () => {
    // A fresh Response per call — a Response body can only be read once, and this test's default
    // load and its tab-switch refetch both read it.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])))
    vi.stubGlobal('fetch', fetchMock)

    render(<LeaderboardPage />)
    await screen.findByText('No rated Blitz games played yet.')

    fireEvent.click(screen.getByRole('button', { name: 'Bullet' }))
    await screen.findByText('No rated Bullet games played yet.')

    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('category=Bullet'))
    expect(screen.getByRole('button', { name: 'Bullet' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Blitz' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows an Untimed tab alongside the four time-control categories', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])))
    vi.stubGlobal('fetch', fetchMock)

    render(<LeaderboardPage />)
    await screen.findByText('No rated Blitz games played yet.')

    fireEvent.click(screen.getByRole('button', { name: 'Untimed' }))
    await screen.findByText('No rated Untimed games played yet.')

    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('category=Untimed'))
  })

  it('shows an empty state when no one has played a rated game', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<LeaderboardPage />)
    expect(await screen.findByText('No rated Blitz games played yet.')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'db unavailable' }, 500)))

    render(<LeaderboardPage />)
    expect(await screen.findByText(/Couldn't load the leaderboard: db unavailable/)).toBeInTheDocument()
  })
})
