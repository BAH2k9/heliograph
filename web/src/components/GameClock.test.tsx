import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameClock } from './GameClock'
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

describe('GameClock', () => {
  it('renders nothing for an untimed game', () => {
    useGame.setState({ gameId: 'g1', status: 'InProgress', timeControl: null })
    const { container } = render(<GameClock />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows both players’ banked times with the active side highlighted', () => {
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '3+2',
      p1RemainingMs: 90_000,
      p2RemainingMs: 120_000,
      turnDeadlineUtc: new Date(Date.now() + 90_000).toISOString(),
      serverOffsetMs: 0,
    })

    render(<GameClock />)

    expect(screen.getByTestId('clock-P1')).toHaveTextContent('1:30')
    expect(screen.getByTestId('clock-P2')).toHaveTextContent('2:00')
    expect(screen.getByTestId('clock-P1').className).toMatch(/bg-slate-700/)
    expect(screen.getByTestId('clock-P2').className).not.toMatch(/bg-slate-700/)
  })

  it('ticks the active side down locally without writing to the store', () => {
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '3+2',
      p1RemainingMs: 90_000,
      p2RemainingMs: 120_000,
      turnDeadlineUtc: new Date(Date.now() + 90_000).toISOString(),
      serverOffsetMs: 0,
    })

    render(<GameClock />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByTestId('clock-P1')).toHaveTextContent('1:25')
    // The store's own banked value never moves — only the display ticks.
    expect(useGame.getState().p1RemainingMs).toBe(90_000)
  })

  it('does not tick the side not on turn', () => {
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '3+2',
      p1RemainingMs: 90_000,
      p2RemainingMs: 120_000,
      turnDeadlineUtc: new Date(Date.now() + 90_000).toISOString(),
      serverOffsetMs: 0,
    })

    render(<GameClock />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByTestId('clock-P2')).toHaveTextContent('2:00')
  })

  it('applies the low-time treatment once the active clock drops under the threshold', () => {
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '1+0',
      p1RemainingMs: 10_000,
      p2RemainingMs: 60_000,
      turnDeadlineUtc: new Date(Date.now() + 10_000).toISOString(),
      serverOffsetMs: 0,
    })

    render(<GameClock />)
    expect(screen.getByTestId('clock-P1').className).toMatch(/text-rose-400/)
  })

  it('claims timeout exactly once when the active clock reaches zero, even across further ticks', () => {
    const claimTimeout = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '1+0',
      p1RemainingMs: 1_000,
      p2RemainingMs: 60_000,
      turnDeadlineUtc: new Date(Date.now() + 1_000).toISOString(),
      serverOffsetMs: 0,
      claimTimeout,
    })

    render(<GameClock />)
    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(claimTimeout).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(claimTimeout).toHaveBeenCalledTimes(1)
  })

  it('claims timeout once on mount for a game already past its deadline', () => {
    const claimTimeout = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '1+0',
      p1RemainingMs: 0,
      p2RemainingMs: 60_000,
      turnDeadlineUtc: new Date(Date.now() - 5_000).toISOString(),
      serverOffsetMs: 0,
      claimTimeout,
    })

    render(<GameClock />)
    expect(claimTimeout).toHaveBeenCalledTimes(1)
  })

  it('shows a coarse day/hour label for a Daily game and never auto-claims a far-off deadline', () => {
    const claimTimeout = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '3/move',
      p1RemainingMs: null,
      p2RemainingMs: null,
      turnDeadlineUtc: new Date(Date.now() + 2 * 86_400_000 + 3 * 3_600_000).toISOString(),
      serverOffsetMs: 0,
      claimTimeout,
    })

    render(<GameClock />)

    expect(screen.getByTestId('clock-P1')).toHaveTextContent('2d 3h left')
    expect(screen.getByTestId('clock-P2')).toHaveTextContent('—')
    expect(claimTimeout).not.toHaveBeenCalled()
  })

  it('claims timeout for a Daily game already past its deadline on load', () => {
    const claimTimeout = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      status: 'InProgress',
      turn: 'P1',
      timeControl: '3/move',
      p1RemainingMs: null,
      p2RemainingMs: null,
      turnDeadlineUtc: new Date(Date.now() - 60_000).toISOString(),
      serverOffsetMs: 0,
      claimTimeout,
    })

    render(<GameClock />)
    expect(claimTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not claim timeout once the game has already finished', () => {
    const claimTimeout = vi.fn(async () => {})
    useGame.setState({
      gameId: 'g1',
      status: 'P1Win',
      turn: 'P1',
      timeControl: '1+0',
      p1RemainingMs: 0,
      p2RemainingMs: 60_000,
      turnDeadlineUtc: new Date(Date.now() - 5_000).toISOString(),
      serverOffsetMs: 0,
      claimTimeout,
    })

    render(<GameClock />)
    expect(claimTimeout).not.toHaveBeenCalled()
  })
})
