import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RematchOfferBanner } from './RematchOfferBanner'
import { useGame } from '../store'

const initialGameState = useGame.getState()

afterEach(() => {
  useGame.setState(initialGameState, true)
})

describe('RematchOfferBanner', () => {
  it('renders nothing when no rematch is pending', () => {
    useGame.setState({ seat: 'P1', rematchOfferedByOpponent: false })
    const { container } = render(<RematchOfferBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a spectator, even if a rematch is pending', () => {
    useGame.setState({ seat: 'Spectator', rematchOfferedByOpponent: true })
    const { container } = render(<RematchOfferBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the offer with Accept/Decline once the opponent has requested a rematch', () => {
    useGame.setState({ seat: 'P1', rematchOfferedByOpponent: true })
    render(<RematchOfferBanner />)

    expect(screen.getByTestId('rematch-offer-banner')).toHaveTextContent('Your opponent wants a rematch')
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  })

  it('Accept calls requestRematch (the same call as this seat\'s own Play again)', () => {
    const requestRematch = vi.fn(async () => {})
    useGame.setState({ seat: 'P1', rematchOfferedByOpponent: true, requestRematch })
    render(<RematchOfferBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(requestRematch).toHaveBeenCalled()
  })

  it('Decline calls declineRematch', () => {
    const declineRematch = vi.fn(async () => {})
    useGame.setState({ seat: 'P2', rematchOfferedByOpponent: true, declineRematch })
    render(<RematchOfferBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))

    expect(declineRematch).toHaveBeenCalled()
  })
})
