import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResignButton } from './ResignButton'
import { useGame } from '../store'

const initialGameState = useGame.getState()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  useGame.setState(initialGameState, true)
  vi.unstubAllGlobals()
})

describe('ResignButton', () => {
  it('renders nothing for a spectator', () => {
    useGame.setState({ seat: 'Spectator', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
    const { container } = render(<ResignButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the game is finished', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'P2Win' })
    const { container } = render(<ResignButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('requires a second click to actually resign', async () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ gameId: 'g1', status: 'P2Win', endReason: 'Resignation', serverNowUtc: new Date().toISOString() }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<ResignButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm resign?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm resign?' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/g1/resign',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ seat: 'P1' }) }),
      ),
    )
  })

  it('reverts the confirm state on blur (a click elsewhere)', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
    render(<ResignButton />)

    const button = screen.getByRole('button', { name: 'Resign' })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Confirm resign?' })).toBeInTheDocument()

    fireEvent.blur(button)
    expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument()
  })

  it('reverts the confirm state on its own after a few seconds', () => {
    vi.useFakeTimers()
    try {
      useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
      render(<ResignButton />)

      fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
      expect(screen.getByRole('button', { name: 'Confirm resign?' })).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
