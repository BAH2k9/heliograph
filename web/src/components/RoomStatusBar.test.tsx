import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomStatusBar } from './RoomStatusBar'
import { useGame } from '../store'
import { useAuth } from '../authStore'
import type { UserProfile } from '../api/authTypes'
import { defaultRatings } from '../test/authFixtures'

const initialGameState = useGame.getState()
const initialAuthState = useAuth.getState()

const user: UserProfile = { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  useGame.setState(initialGameState, true)
  useAuth.setState(initialAuthState, true)
  vi.unstubAllGlobals()
})

describe('RoomStatusBar', () => {
  it('renders nothing outside a room', () => {
    const { container } = render(<RoomStatusBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows no claim button for a guest', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123' })
    render(<RoomStatusBar />)
    expect(screen.queryByRole('button', { name: 'Claim for my account' })).toBeNull()
  })

  it('shows no claim button for a spectator, even logged in', () => {
    useGame.setState({ seat: 'Spectator', gameId: 'g1', roomCode: 'ABC123' })
    useAuth.setState({ user })
    render(<RoomStatusBar />)
    expect(screen.queryByRole('button', { name: 'Claim for my account' })).toBeNull()
  })

  it('hides the claim button when the seat is already claimed server-side', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', p1Claimed: true })
    useAuth.setState({ user })
    render(<RoomStatusBar />)
    expect(screen.queryByRole('button', { name: 'Claim for my account' })).toBeNull()
  })

  it('shows a Rated badge for a rated game', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', rated: true })
    render(<RoomStatusBar />)
    expect(screen.getByText('Rated')).toBeInTheDocument()
  })

  it('claims the seat for a logged-in player', async () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123' })
    useAuth.setState({ user, accessToken: 'tok' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ gameId: 'g1', seat: 'P1', claimed: true })))

    render(<RoomStatusBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Claim for my account' }))

    await waitFor(() => expect(screen.getByText('claimed for your account')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Claim for my account' })).toBeNull()
  })

  it('shows an error state if claiming fails', async () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123' })
    useAuth.setState({ user, accessToken: 'tok' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'seat already claimed' }, 409)))

    render(<RoomStatusBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Claim for my account' }))

    expect(await screen.findByText("couldn't claim")).toBeInTheDocument()
  })

  it('shows no Resign button for a spectator', () => {
    useGame.setState({ seat: 'Spectator', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
    render(<RoomStatusBar />)
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull()
  })

  it('shows no Resign button once the game is finished', () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'P2Win' })
    render(<RoomStatusBar />)
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull()
  })

  it('requires a second click to actually resign', async () => {
    useGame.setState({ seat: 'P1', gameId: 'g1', roomCode: 'ABC123', status: 'InProgress' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ gameId: 'g1', status: 'P2Win', endReason: 'Resignation', serverNowUtc: new Date().toISOString() }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<RoomStatusBar />)
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
    render(<RoomStatusBar />)

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
      render(<RoomStatusBar />)

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
