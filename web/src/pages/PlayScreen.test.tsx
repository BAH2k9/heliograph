import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayScreen } from './PlayScreen'
import type { PieceKind } from '../api/types'
import type { PlayOutletContext } from '../layout/AppLayout'
import { useAuth } from '../authStore'
import { useGame } from '../store'

const initialGameState = useGame.getState()
const initialAuthState = useAuth.getState()

const outletContext: PlayOutletContext = {
  openSettings: () => {},
  settingsOpen: false,
  openBugReport: () => {},
  openPlayMenu: () => {},
}

// `PlayScreen` reads its header controls via `useOutletContext` — stand in for `AppLayout` with a
// bare `Outlet` so the route tree supplies one without dragging in the whole layout shell.
function LayoutStub() {
  return <Outlet context={outletContext} />
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/play']}>
      <Routes>
        <Route element={<LayoutStub />}>
          <Route path="/play" element={<PlayScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  useGame.setState(initialGameState, true)
  useAuth.setState(initialAuthState, true)
})

describe('PlayScreen player cards in a bot game', () => {
  it('shows the signed-in user\'s real identity and the bot\'s persona, not "Guest"', () => {
    useAuth.setState({
      user: {
        id: 'u1',
        email: 'ada@example.com',
        displayName: 'Ada',
        avatarId: 'gear',
        ratings: [
          { category: 'Bullet', rating: 1200, gamesPlayed: 0 },
          { category: 'Blitz', rating: 1200, gamesPlayed: 0 },
          { category: 'Rapid', rating: 1200, gamesPlayed: 0 },
          { category: 'Daily', rating: 1200, gamesPlayed: 0 },
          { category: 'Untimed', rating: 1350, gamesPlayed: 4 },
        ],
      },
    })
    useGame.setState({
      gameId: 'g1',
      seat: null,
      botSeat: 'P2',
      botDifficulty: 'Hard',
      status: 'InProgress',
      p1Profile: null,
      p2Profile: null,
    })

    renderScreen()

    const humanCard = screen.getByTestId('player-card-P1')
    expect(humanCard).toHaveTextContent('Ada')
    expect(humanCard).toHaveTextContent('1350')
    expect(humanCard).not.toHaveTextContent('Guest')

    const botCard = screen.getByTestId('player-card-P2')
    expect(botCard).not.toHaveTextContent('Guest')
    expect(botCard).not.toHaveTextContent('Waiting for opponent')
  })

  it('a guest playing the bot still shows "Guest" for their own seat, bot still shows its persona', () => {
    useGame.setState({
      gameId: 'g1',
      seat: null,
      botSeat: 'P2',
      botDifficulty: 'Easy',
      status: 'InProgress',
      p1Profile: null,
      p2Profile: null,
    })

    renderScreen()

    expect(screen.getByTestId('player-card-P1')).toHaveTextContent('Guest')
    expect(screen.getByTestId('player-card-P2')).not.toHaveTextContent('Guest')
  })
})

describe('PlayScreen rotate buttons', () => {
  // One P1 piece of the given kind at (2,4), already selected on P1's turn in a Local Play game.
  function selectPiece(kind: PieceKind) {
    const rotateSelected = vi.fn().mockResolvedValue(undefined)
    useGame.setState({
      gameId: 'g1',
      isLocal: true,
      status: 'InProgress',
      turn: 'P1',
      board: {
        rows: 8,
        cols: 10,
        pieces: [
          { id: 'p1', row: 2, col: 4, kind, owner: 'P1', orientation: kind === 'Keep' ? null : 'NW', health: null },
        ],
      },
      selected: { row: 2, col: 4 },
      rotateSelected,
    })
    return rotateSelected
  }

  it('replace the old "rotate with the arrows" hint and rotate the selected piece', () => {
    const rotateSelected = selectPiece('Mirror')

    renderScreen()

    expect(screen.queryByText(/Rotate with the arrows on the piece/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }))
    expect(rotateSelected).toHaveBeenLastCalledWith('CCW')
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(rotateSelected).toHaveBeenLastCalledWith('CW')
  })

  it('show a single Flip button for a selected Heliostat', () => {
    selectPiece('Heliostat')

    renderScreen()

    expect(screen.getByRole('button', { name: 'Flip' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate left' })).not.toBeInTheDocument()
  })

  it("don't appear for a piece that can't rotate", () => {
    selectPiece('Keep')

    renderScreen()

    expect(screen.queryByRole('button', { name: 'Rotate left' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Flip' })).not.toBeInTheDocument()
  })
})
