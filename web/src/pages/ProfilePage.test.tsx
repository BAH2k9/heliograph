import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePage'
import { useAuth } from '../authStore'
import type { GameSummary } from '../api/types'
import type { RatingBucket } from '../api/authTypes'

const initialAuthState = useAuth.getState()

/** All 4 buckets at the 1200/0 default, with per-category overrides. */
function ratings(overrides: Partial<Record<string, { rating: number; gamesPlayed: number }>> = {}): RatingBucket[] {
  return ['Bullet', 'Blitz', 'Rapid', 'Daily'].map((category) => ({
    category,
    rating: overrides[category]?.rating ?? 1200,
    gamesPlayed: overrides[category]?.gamesPlayed ?? 0,
  }))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/replay/:gameId" element={<p>replay stub</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  useAuth.setState(initialAuthState, true)
  vi.unstubAllGlobals()
})

describe('ProfilePage', () => {
  it('renders nothing when logged out', () => {
    const { container } = renderPage()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the account header and games once loaded', async () => {
    useAuth.setState({
      user: {
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Ana',
        ratings: ratings({ Blitz: { rating: 1310, gamesPlayed: 3 } }),
      },
    })
    const games: GameSummary[] = [
      {
        id: 'g1',
        createdAtUtc: '2026-09-04T18:00:00Z',
        finishedAtUtc: '2026-09-04T18:05:30Z',
        status: 'P1Win',
        ruleset: 'Classic',
        layout: 'Classic',
        rated: true,
        moveCount: 12,
        endReason: 'Pharaoh',
      },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(games)))

    renderPage()

    expect(screen.getByText('Ana')).toBeInTheDocument()
    // One badge per category — the non-default Blitz bucket and the untouched 1200 defaults.
    expect(screen.getByText('Blitz 1310')).toBeInTheDocument()
    expect(screen.getByText('Bullet 1200')).toBeInTheDocument()
    expect(screen.getByText('Rapid 1200')).toBeInTheDocument()
    expect(screen.getByText('Daily 1200')).toBeInTheDocument()
    expect(await screen.findByText('Classic')).toBeInTheDocument()
    expect(screen.getByText('Rated')).toBeInTheDocument()
    // An ordinary Pharaoh-elimination win shows the plain status, no "by timeout" qualifier.
    expect(screen.getByText('P1Win')).toBeInTheDocument()
  })

  it('shows a "by timeout" qualifier on the Status cell when endReason is Timeout', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: ratings({ Blitz: { rating: 1200, gamesPlayed: 1 } }) } })
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
    expect(await screen.findByText('P2Win · by timeout')).toBeInTheDocument()
  })

  it('shows an empty state when there are no games', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: ratings() } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    renderPage()
    expect(await screen.findByText(/No games yet/)).toBeInTheDocument()
  })

  it('clicking a game row navigates to its replay screen', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: ratings() } })
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
