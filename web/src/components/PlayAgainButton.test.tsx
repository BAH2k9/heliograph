import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayAgainButton } from './PlayAgainButton'
import { useGame } from '../store'

const initialGameState = useGame.getState()

afterEach(() => {
  useGame.setState(initialGameState, true)
})

describe('PlayAgainButton', () => {
  it('renders nothing while the game is in progress', () => {
    useGame.setState({ status: 'InProgress', overlayDismissed: true })
    const { container } = render(<PlayAgainButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing until the win overlay has been dismissed', () => {
    useGame.setState({ status: 'P1Win', overlayDismissed: false })
    const { container } = render(<PlayAgainButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('starts a rematch once the game is over and the overlay is dismissed', () => {
    const playAgain = vi.fn()
    useGame.setState({ status: 'P1Win', overlayDismissed: true, seat: null, playAgain })
    render(<PlayAgainButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(playAgain).toHaveBeenCalledOnce()
  })

  it('is enabled and starts a rematch even while still seated in a room', () => {
    const playAgain = vi.fn()
    useGame.setState({ status: 'P2Win', overlayDismissed: true, seat: 'P1', playAgain })
    render(<PlayAgainButton />)
    const button = screen.getByRole('button', { name: 'Play again' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(playAgain).toHaveBeenCalledOnce()
  })
})
