import { render, screen, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useAuth } from './authStore'
import { useGame } from './store'
import { defaultRatings } from './test/authFixtures'

const initialState = useGame.getState()
const initialAuthState = useAuth.getState()

afterEach(() => {
  useGame.setState(initialState, true)
  useAuth.setState(initialAuthState, true)
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('shows the landing page with a full sidebar at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Host Game' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Game' })).toBeInTheDocument()
    expect(screen.getAllByText('Khet').length).toBeGreaterThan(0)
  })

  it('redirects /play to / when there is no game to resume', () => {
    render(
      <MemoryRouter initialEntries={['/play']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
  })

  it('Local Play opens the setup dialog and confirming lands on the play screen', async () => {
    const newGame = vi.fn(async () => {
      useGame.setState({
        gameId: 'g1',
        board: { rows: 8, cols: 10, pieces: [] },
        turn: 'P1',
        status: 'InProgress',
        moveCount: 0,
      })
    })
    useGame.setState({ newGame })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Local Play' }))
    const dialog = screen.getByRole('dialog', { name: 'Local Play' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Local Play' }))
    expect(newGame).toHaveBeenCalledOnce()

    expect(await screen.findByText('move 0')).toBeInTheDocument()
    expect(screen.queryByText(/Pick Local Play, Host Game/)).toBeNull()
  })

  it('Game Archive navigates to the archive page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Game Archive' }))
    expect(await screen.findByRole('heading', { name: 'Game Archive' })).toBeInTheDocument()
  })

  it('redirects /profile to the landing page for a guest', () => {
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
  })

  it('redirects /leaderboard to the landing page for a guest', () => {
    render(
      <MemoryRouter initialEntries={['/leaderboard']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
  })

  it('a logged-in account can reach /profile and /leaderboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() } })

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument()
  })

  it('logged-in sidebar shows the display name and a Leaderboard entry', () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() } })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leaderboard' })).toBeInTheDocument()
  })

  it('redirects /admin to the landing page for a guest', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
  })

  it('redirects /admin to the landing page for a non-admin account', () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings(), isAdmin: false } })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull()
  })

  it('an admin account reaches /admin and gets an Admin nav entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            totalUsers: 3,
            adminCount: 1,
            disabledCount: 0,
            gamesInProgress: 2,
            gamesFinished: 5,
            openRooms: 1,
            ratedGames: 4,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings(), isAdmin: true } })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Admin', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  })
})
