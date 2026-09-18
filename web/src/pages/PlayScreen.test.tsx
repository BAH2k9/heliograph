import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PlayScreen } from './PlayScreen'
import type { PlayOutletContext } from '../layout/AppLayout'
import { useAuth } from '../authStore'
import { useGame } from '../store'

const initialGameState = useGame.getState()
const initialAuthState = useAuth.getState()

const outletContext: PlayOutletContext = {
  openSettings: () => {},
  settingsOpen: false,
  openBugReport: () => {},
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
        avatarId: 'sphinx',
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
