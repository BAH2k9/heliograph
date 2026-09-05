import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DisconnectBanner } from './DisconnectBanner'
import { useGame } from '../store'

const initialGameState = useGame.getState()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  useGame.setState(initialGameState, true)
  vi.useRealTimers()
})

describe('DisconnectBanner', () => {
  it('renders nothing when nothing is tracked disconnected', () => {
    useGame.setState({ gameId: 'g1', seat: 'P1', status: 'InProgress' })
    const { container } = render(<DisconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a spectator, even if a seat is tracked disconnected', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'Spectator',
      status: 'InProgress',
      p1DisconnectedAtUtc: new Date(Date.now() - 5_000).toISOString(),
    })
    const { container } = render(<DisconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ignores its own seat’s disconnect state — only the opponent’s is actionable', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p1DisconnectedAtUtc: new Date(Date.now() - 5_000).toISOString(),
      p2DisconnectedAtUtc: null,
    })
    const { container } = render(<DisconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the game has finished', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'P1Win',
      p2DisconnectedAtUtc: new Date(Date.now() - 5_000).toISOString(),
    })
    const { container } = render(<DisconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a counting-down claimable-in message before the 45s grace window elapses', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p2DisconnectedAtUtc: new Date(Date.now() - 5_000).toISOString(),
    })
    render(<DisconnectBanner />)

    expect(screen.getByTestId('disconnect-banner')).toHaveTextContent('Opponent disconnected — claimable in 40s')
    expect(screen.queryByRole('button', { name: 'Claim win' })).toBeNull()
  })

  it('ticks the countdown down locally', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p2DisconnectedAtUtc: new Date(Date.now() - 5_000).toISOString(),
    })
    render(<DisconnectBanner />)

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByTestId('disconnect-banner')).toHaveTextContent('claimable in 35s')
  })

  it('shows the Claim win button once the grace window has elapsed', () => {
    const claimAbandonment = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p2DisconnectedAtUtc: new Date(Date.now() - 45_000).toISOString(),
      claimAbandonment,
    })
    render(<DisconnectBanner />)

    expect(screen.getByTestId('disconnect-banner')).toHaveTextContent('Opponent disconnected')
    expect(screen.getByRole('button', { name: 'Claim win' })).toBeInTheDocument()
  })

  it('auto-claims exactly once when the countdown reaches zero, even across further ticks', () => {
    const claimAbandonment = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p2DisconnectedAtUtc: new Date(Date.now() - 44_000).toISOString(),
      claimAbandonment,
    })
    render(<DisconnectBanner />)

    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(claimAbandonment).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(claimAbandonment).toHaveBeenCalledTimes(1)
  })

  it('auto-claims once on mount when the disconnect is already past the grace window', () => {
    const claimAbandonment = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p2DisconnectedAtUtc: new Date(Date.now() - 60_000).toISOString(),
      claimAbandonment,
    })
    render(<DisconnectBanner />)

    expect(claimAbandonment).toHaveBeenCalledTimes(1)
  })

  it('clicking Claim win calls claimAbandonment', () => {
    const claimAbandonment = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      seat: 'P1',
      status: 'InProgress',
      p2DisconnectedAtUtc: new Date(Date.now() - 45_000).toISOString(),
      claimAbandonment,
    })
    render(<DisconnectBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Claim win' }))
    expect(claimAbandonment).toHaveBeenCalled()
  })

  it('reacts to the opposite seat — a P2 client sees P1’s disconnect', () => {
    useGame.setState({
      gameId: 'g1',
      seat: 'P2',
      status: 'InProgress',
      p1DisconnectedAtUtc: new Date(Date.now() - 5_000).toISOString(),
    })
    render(<DisconnectBanner />)

    expect(screen.getByTestId('disconnect-banner')).toHaveTextContent('claimable in 40s')
  })
})
