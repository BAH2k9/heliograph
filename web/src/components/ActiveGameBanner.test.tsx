import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActiveGameBanner } from './ActiveGameBanner'
import { GameClockProvider } from './GameClockContext'
import { useGame } from '../store'

const initialGameState = useGame.getState()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  useGame.setState(initialGameState, true)
  vi.unstubAllGlobals()
})

function renderBanner(path = '/leaderboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GameClockProvider>
        <Routes>
          <Route path="*" element={<ActiveGameBanner />} />
        </Routes>
      </GameClockProvider>
    </MemoryRouter>,
  )
}

describe('ActiveGameBanner', () => {
  it('renders nothing with no active game', () => {
    useGame.setState({ gameId: null })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the game is finished', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'P1Win' })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on any /play* route — PlayScreen already shows this information', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'InProgress' })
    const { container } = renderBanner('/play/invite')
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a spectator', () => {
    useGame.setState({ gameId: 'g1', seat: 'Spectator', status: 'InProgress' })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the opponent and whose turn it is for a room game', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      turn: 'P1',
      status: 'InProgress',
      p1Profile: { displayName: 'Ada', avatarId: null, rating: 1200 },
      p2Profile: { displayName: 'Bea', avatarId: null, rating: 1300 },
    })
    renderBanner()

    expect(screen.getByTestId('active-game-banner')).toHaveTextContent('vs Bea')
    expect(screen.getByTestId('active-game-banner')).toHaveTextContent('Your turn')
  })

  it('shows "Waiting for opponent" when it is not my turn', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', turn: 'P2', status: 'InProgress' })
    renderBanner()
    expect(screen.getByTestId('active-game-banner')).toHaveTextContent('Waiting for opponent')
  })

  it('labels a bot game and reflects whose turn it is', () => {
    useGame.setState({
      gameId: 'g1',
      seat: null,
      botSeat: 'P2',
      botDifficulty: 'Hard',
      turn: 'P1',
      status: 'InProgress',
    })
    renderBanner()
    const banner = screen.getByTestId('active-game-banner')
    expect(banner).toHaveTextContent('vs Bot (Hard)')
    expect(banner).toHaveTextContent('Your turn')
  })

  it('labels a local game', () => {
    useGame.setState({ gameId: 'g1', seat: null, isLocal: true, status: 'InProgress' })
    renderBanner()
    expect(screen.getByTestId('active-game-banner')).toHaveTextContent('Local game')
  })

  it('"View game" navigates to /play', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'InProgress' })
    render(
      <MemoryRouter initialEntries={['/leaderboard']}>
        <GameClockProvider>
          <Routes>
            <Route path="/leaderboard" element={<ActiveGameBanner />} />
            <Route path="/play" element={<p>play screen stub</p>} />
          </Routes>
        </GameClockProvider>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View game' }))

    expect(screen.getByText('play screen stub')).toBeInTheDocument()
  })

  it('shows "Resign" before any move has been played', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'InProgress', moveCount: 0 })
    renderBanner()
    expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument()
  })

  it('shows "End Game" once the game has begun', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'InProgress', moveCount: 1 })
    renderBanner()
    expect(screen.getByRole('button', { name: 'End Game' })).toBeInTheDocument()
  })

  it('resigns after a two-step confirm, same as ResignButton', async () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'InProgress' })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ gameId: 'g1', status: 'P2Win', endReason: 'Resignation', serverNowUtc: new Date().toISOString() }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resign?' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/g1/resign',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ seat: 'P1' }) }),
      ),
    )
  })
})
