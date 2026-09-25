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
    useGame.setState({ seat: 'Spectator', gameId: 'g1', status: 'InProgress' })
    const { container } = render(<ResignButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the game is finished', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', status: 'P2Win' })
    const { container } = render(<ResignButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders and resigns on behalf of the current mover in Local Play (no seated player)', async () => {
    useGame.setState({ seat: null, isLocal: true, gameId: 'g1', status: 'InProgress', turn: 'P2' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ gameId: 'g1', status: 'P1Win', endReason: 'Resignation', serverNowUtc: new Date().toISOString() }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<ResignButton />)
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resign?' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/g1/resign',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ seat: 'P2' }) }),
      ),
    )
  })

  it('renders and resigns on behalf of the human seat in a bot game (no seated player)', async () => {
    useGame.setState({ seat: null, botSeat: 'P1', gameId: 'g1', status: 'InProgress', turn: 'P2' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ gameId: 'g1', status: 'P1Win', endReason: 'Resignation', serverNowUtc: new Date().toISOString() }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<ResignButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resign?' }))

    // The bot plays P1, so the human is P2 — resign concedes on their behalf regardless of turn.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/g1/resign',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ seat: 'P2' }) }),
      ),
    )
  })

  it('requires a second click to actually resign', async () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', status: 'InProgress' })
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
    useGame.setState({ seat: 'P1', gameId: 'g1', status: 'InProgress' })
    render(<ResignButton />)

    const button = screen.getByRole('button', { name: 'Resign' })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Confirm resign?' })).toBeInTheDocument()

    fireEvent.blur(button)
    expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument()
  })

  it('reads "Resign" before any move has been played', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', status: 'InProgress', moveCount: 0 })
    render(<ResignButton />)
    expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument()
  })

  it('reads "End Game" once the game has begun', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', status: 'InProgress', moveCount: 1 })
    render(<ResignButton />)
    expect(screen.getByRole('button', { name: 'End Game' })).toBeInTheDocument()
  })

  it('reads "End Game" in Local Play even before any move has been played', () => {
    useGame.setState({ seat: null, isLocal: true, gameId: 'g1', status: 'InProgress', moveCount: 0 })
    render(<ResignButton />)
    expect(screen.getByRole('button', { name: 'End Game' })).toBeInTheDocument()
  })

  it('reads "Resign" in a bot game even after moves have been played', () => {
    useGame.setState({ seat: null, botSeat: 'P1', gameId: 'g1', status: 'InProgress', moveCount: 5 })
    render(<ResignButton />)
    expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument()
  })

  it('reverts the confirm state on its own after a few seconds', () => {
    vi.useFakeTimers()
    try {
      useGame.setState({ seat: 'P1', gameId: 'g1', status: 'InProgress' })
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
