import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayHubScreen } from './PlayHubScreen'
import { useGame } from '../store'

const initialGameState = useGame.getState()

afterEach(() => {
  useGame.setState(initialGameState, true)
})

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/play/new']}>
      <Routes>
        <Route path="/play/new" element={<PlayHubScreen />} />
        <Route path="/play" element={<p>play screen stub</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayHubScreen', () => {
  it('shows all four time-control categories with their presets', () => {
    renderHub()

    expect(screen.getByRole('heading', { name: 'Bullet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Blitz' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rapid' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Daily' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: '1+0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3+2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '15+10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3 days/move' })).toBeInTheDocument()
  })

  it('keeps Advanced options collapsed by default', () => {
    renderHub()
    expect(screen.queryByLabelText('Ruleset')).toBeNull()
    expect(screen.getByRole('button', { name: 'Advanced options' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('Advanced options expands to reveal ruleset/layout, closed by default', () => {
    renderHub()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced options' }))
    expect(screen.getByLabelText('Ruleset')).toBeInTheDocument()
    expect(screen.getByLabelText('Layout')).toHaveValue('Dawn')

    // Every setup plays under every ruleset, so switching ruleset keeps the chosen setup.
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'Zenith' } })
    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'TurningSun' } })
    expect(screen.getByLabelText('Layout')).toHaveValue('Zenith')
  })

  it('picking a preset calls createRoom with the timeControl/ruleset/layout and navigates to /play', async () => {
    const createRoom = vi.fn(async () => {
      useGame.setState({ gameId: 'g1' })
    })
    useGame.setState({ createRoom })

    renderHub()
    fireEvent.click(screen.getByRole('button', { name: '3+2' }))

    expect(await screen.findByText('play screen stub')).toBeInTheDocument()
    expect(createRoom).toHaveBeenCalledWith({ timeControl: '3+2', ruleset: 'FixedSun', layout: 'Dawn' })
  })

  it('picking a preset with Advanced options changed forwards the chosen ruleset/layout', async () => {
    const createRoom = vi.fn(async () => {
      useGame.setState({ gameId: 'g1' })
    })
    useGame.setState({ createRoom })

    renderHub()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced options' }))
    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'TurningSun' } })

    fireEvent.click(screen.getByRole('button', { name: '1+0' }))

    expect(await screen.findByText('play screen stub')).toBeInTheDocument()
    expect(createRoom).toHaveBeenCalledWith({ timeControl: '1+0', ruleset: 'TurningSun', layout: 'Dawn' })
  })

  it('does not navigate when createRoom leaves an error set', async () => {
    const createRoom = vi.fn(async () => {
      useGame.setState({ error: 'room creation failed' })
    })
    useGame.setState({ createRoom })

    renderHub()
    fireEvent.click(screen.getByRole('button', { name: '1+0' }))

    await vi.waitFor(() => expect(createRoom).toHaveBeenCalled())
    expect(screen.queryByText('play screen stub')).toBeNull()
  })
})
