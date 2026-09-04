import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../store'
import { WinOverlay } from './WinOverlay'

afterEach(() => {
  useGame.setState({ status: 'InProgress', moveCount: 0, busy: false, seat: null })
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

  it('"Play again" starts a new game', () => {
    const newGame = vi.fn()
    useGame.setState({ status: 'P1Win', newGame })
    render(<WinOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(newGame).toHaveBeenCalledOnce()
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
