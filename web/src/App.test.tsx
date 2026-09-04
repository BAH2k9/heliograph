import { render, screen, within } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useGame } from './store'

const initialState = useGame.getState()

afterEach(() => {
  useGame.setState(initialState, true)
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
    const dialog = screen.getByRole('dialog', { name: 'New game options' })

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
})
