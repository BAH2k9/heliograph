import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePage'
import { useAuth } from '../authStore'
import type { GameSummary } from '../api/types'

const initialAuthState = useAuth.getState()

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
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', rating: 1310, ratedGamesPlayed: 3 } })
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
    expect(screen.getByText(/Rating: 1310/)).toBeInTheDocument()
    expect(await screen.findByText('Classic')).toBeInTheDocument()
    expect(screen.getByText('Rated')).toBeInTheDocument()
    // An ordinary Pharaoh-elimination win shows the plain status, no "by timeout" qualifier.
    expect(screen.getByText('P1Win')).toBeInTheDocument()
  })

  it('shows a "by timeout" qualifier on the Status cell when endReason is Timeout', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', rating: 1200, ratedGamesPlayed: 1 } })
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
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', rating: 1200, ratedGamesPlayed: 0 } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    renderPage()
    expect(await screen.findByText(/No games yet/)).toBeInTheDocument()
  })

  it('clicking a game row navigates to its replay screen', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', rating: 1200, ratedGamesPlayed: 0 } })
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
