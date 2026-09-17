import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RoomStatusBar } from './RoomStatusBar'
import { useGame } from '../store'
import { useAuth } from '../authStore'

const initialGameState = useGame.getState()
const initialAuthState = useAuth.getState()

afterEach(() => {
  useGame.setState(initialGameState, true)
  useAuth.setState(initialAuthState, true)
})

describe('RoomStatusBar', () => {
  it('renders nothing outside a room', () => {
    const { container } = render(<RoomStatusBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a Rated badge for a rated game', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', rated: true })
    render(<RoomStatusBar />)
    expect(screen.getByText('Rated')).toBeInTheDocument()
  })

  // The clock relocated onto the two `PlayerCard`s (see `PlayScreen`) — this bar keeps room
  // code/rated only.
  it('renders no clock — the clock lives in the player cards now', () => {
    useGame.setState({
      seat: 'P1',
      gameId: 'g1',
      roomCode: 'ABC123',
      timeControl: '3+2',
      p1RemainingMs: 90_000,
      p2RemainingMs: 90_000,
    })
    render(<RoomStatusBar />)
    expect(screen.queryByTestId('clock-P1')).toBeNull()
    expect(screen.queryByTestId('clock-P2')).toBeNull()
  })

  it('has no whose-turn text — that lives on the player cards now', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
    render(<RoomStatusBar />)
    expect(screen.queryByText('Your turn')).toBeNull()
    expect(screen.queryByText(/you are/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull()
  })
})
