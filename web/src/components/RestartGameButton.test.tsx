import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RestartGameButton } from './RestartGameButton'
import { useGame } from '../store'

const initialGameState = useGame.getState()

afterEach(() => {
  useGame.setState(initialGameState, true)
})

describe('RestartGameButton', () => {
  it('renders nothing for a real multiplayer room', () => {
    useGame.setState({ seat: 'P1', isLocal: false, botSeat: null, status: 'InProgress' })
    const { container } = render(<RestartGameButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the game is finished', () => {
    useGame.setState({ isLocal: true, status: 'P2Win' })
    const { container } = render(<RestartGameButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders and restarts in Local Play', () => {
    const restartGame = vi.fn()
    useGame.setState({ seat: null, isLocal: true, botSeat: null, status: 'InProgress', restartGame })
    render(<RestartGameButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(restartGame).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Restart game?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restart game?' }))
    expect(restartGame).toHaveBeenCalledOnce()
  })

  it('renders and restarts in a bot game', () => {
    const restartGame = vi.fn()
    useGame.setState({ seat: null, isLocal: false, botSeat: 'P1', status: 'InProgress', restartGame })
    render(<RestartGameButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restart game?' }))
    expect(restartGame).toHaveBeenCalledOnce()
  })

  it('reverts the confirm state on blur (a click elsewhere)', () => {
    useGame.setState({ isLocal: true, status: 'InProgress' })
    render(<RestartGameButton />)

    const button = screen.getByRole('button', { name: 'Play again' })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Restart game?' })).toBeInTheDocument()

    fireEvent.blur(button)
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
  })

  it('reverts the confirm state on its own after a few seconds', () => {
    vi.useFakeTimers()
    try {
      useGame.setState({ isLocal: true, status: 'InProgress' })
      render(<RestartGameButton />)

      fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
      expect(screen.getByRole('button', { name: 'Restart game?' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
