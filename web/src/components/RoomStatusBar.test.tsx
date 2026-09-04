import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomStatusBar } from './RoomStatusBar'
import { useGame } from '../store'
import { useAuth } from '../authStore'
import type { UserProfile } from '../api/authTypes'

const initialGameState = useGame.getState()
const initialAuthState = useAuth.getState()

const user: UserProfile = { id: 'u1', email: 'a@b.com', displayName: 'Ana', rating: 1200, ratedGamesPlayed: 0 }

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
})
