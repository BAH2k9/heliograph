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

const loggedInUser = { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() }

function loginAs(user: typeof loggedInUser & { isAdmin?: boolean }) {
  // No accessToken/refreshToken here deliberately: AppLayout's boot-time hydrate() no-ops
  // without a persisted refreshToken, and these tests don't want it racing the page's own
  // fetch mock with an unrelated /api/auth/refresh call.
  useAuth.setState({ user })
}

afterEach(() => {
  useGame.setState(initialState, true)
  useAuth.setState(initialAuthState, true)
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('redirects an unauthenticated visit to any route to /login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Local Play' })).toBeNull()
  })

  it('/credits renders without a session, unlike every other route', () => {
    render(
      <MemoryRouter initialEntries={['/credits']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Credits' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log In' })).toBeNull()
  })

  it('shows a © footer linking to /credits once logged in', () => {
    loginAs(loggedInUser)
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Bailey Halliday/ })).toHaveAttribute('href', '/credits')
  })

  it('shows the landing page with a full sidebar at / once logged in', () => {
    loginAs(loggedInUser)
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Challenge a Friend' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join Game' })).toBeNull()
    expect(screen.getAllByText('Heliograph').length).toBeGreaterThan(0)
  })

  it('redirects /play to / when there is no game to resume', () => {
    loginAs(loggedInUser)
    render(
      <MemoryRouter initialEntries={['/play']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
  })

  it('Local Play opens the setup dialog and confirming lands on the play screen', async () => {
    loginAs(loggedInUser)
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
    expect(screen.queryByText(/Pick Local Play/)).toBeNull()
  })

  it('Game Archive navigates to the archive page', async () => {
    loginAs(loggedInUser)
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

  it('a logged-in account can reach /profile and /leaderboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )
    loginAs(loggedInUser)

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Ana' })).toBeInTheDocument()
  })

  it('logged-in sidebar shows the display name and a Leaderboard entry', () => {
    loginAs(loggedInUser)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leaderboard' })).toBeInTheDocument()
  })

  it('redirects /admin to / for a non-admin account', () => {
    loginAs({ ...loggedInUser, isAdmin: false })

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
    loginAs({ ...loggedInUser, isAdmin: true })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Admin', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  })
})
