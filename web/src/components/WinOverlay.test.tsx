import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../store'
import { WinOverlay } from './WinOverlay'

afterEach(() => {
  useGame.setState({
    status: 'InProgress',
    endReason: null,
    moveCount: 0,
    busy: false,
    seat: null,
    ruleset: 'Classic',
    layout: 'Classic',
    botSeat: null,
    botDifficulty: null,
    overlayReady: true,
    overlayDismissed: false,
    rematchRequestedByMe: false,
  })
})

describe('WinOverlay', () => {
  it('stays hidden while the game is in progress', () => {
    useGame.setState({ status: 'InProgress' })
    render(<WinOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces the P1 winner and the move it ended on', () => {
    useGame.setState({ status: 'P1Win', moveCount: 12 })
    render(<WinOverlay />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Silver (P1) wins')).toBeInTheDocument()
    expect(screen.getByText('on move 12')).toBeInTheDocument()
  })

  it('announces the P2 winner', () => {
    useGame.setState({ status: 'P2Win', moveCount: 7 })
    render(<WinOverlay />)
    expect(screen.getByText('Red (P2) wins')).toBeInTheDocument()
  })

  it('adds a "by resignation" qualifier when endReason is Resignation', () => {
    useGame.setState({ status: 'P1Win', moveCount: 9, endReason: 'Resignation' })
    render(<WinOverlay />)
    expect(screen.getByText('Silver (P1) wins · by resignation')).toBeInTheDocument()
  })

  it('adds a "by timeout" qualifier when endReason is Timeout', () => {
    useGame.setState({ status: 'P2Win', moveCount: 4, endReason: 'Timeout' })
    render(<WinOverlay />)
    expect(screen.getByText('Red (P2) wins · by timeout')).toBeInTheDocument()
  })

  it('"Play again" starts a new game', () => {
    const newGame = vi.fn()
    useGame.setState({ status: 'P1Win', newGame })
    render(<WinOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(newGame).toHaveBeenCalledOnce()
  })

  it('"Play again" starts a new bot game with the same difficulty and seat for a bot game', () => {
    const newBotGame = vi.fn()
    useGame.setState({
      status: 'P1Win',
      ruleset: 'Classic',
      layout: 'Classic',
      botSeat: 'P2',
      botDifficulty: 'Hard',
      newBotGame,
    })
    render(<WinOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(newBotGame).toHaveBeenCalledWith({
      difficulty: 'Hard',
      ruleset: 'Classic',
      layout: 'Classic',
      playerSeat: 'P1',
    })
  })

  it('"Play again" requests a rematch (not a new game) when still seated in a room', () => {
    const requestRematch = vi.fn()
    const newGame = vi.fn()
    useGame.setState({ status: 'P1Win', seat: 'P1', roomCode: 'ABCD', requestRematch, newGame })
    render(<WinOverlay />)
    const button = screen.getByRole('button', { name: 'Play again' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(requestRematch).toHaveBeenCalledOnce()
    expect(newGame).not.toHaveBeenCalled()
    expect(useGame.getState().seat).toBe('P1')
    expect(useGame.getState().roomCode).toBe('ABCD')
  })

  it('shows a disabled "Waiting…" state once this seat has requested a rematch', () => {
    useGame.setState({ status: 'P1Win', seat: 'P1', roomCode: 'ABCD', rematchRequestedByMe: true })
    render(<WinOverlay />)
    expect(screen.getByRole('button', { name: 'Waiting…' })).toBeDisabled()
  })

  it('stays hidden until overlayReady, even once status flips to a win', () => {
    useGame.setState({ status: 'P1Win', overlayReady: false })
    render(<WinOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"View board" dismisses the overlay without touching the game', () => {
    const newGame = vi.fn()
    useGame.setState({ status: 'P2Win', newGame })
    render(<WinOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'View board' }))
    return waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()).then(() => {
      expect(newGame).not.toHaveBeenCalled()
      expect(useGame.getState().status).toBe('P2Win')
    })
  })
})
