import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlayerCard } from './PlayerCard'
import type { PlayerSummary } from '../api/types'

const profile: PlayerSummary = { displayName: 'Ana', avatarId: 'sphinx', rating: 1310 }

describe('PlayerCard', () => {
  it('shows the avatar, display name, and rating badge for a claimed seat', () => {
    render(<PlayerCard seat="P1" profile={profile} isYou={false} active={false} clock={null} />)

    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('1310')).toBeInTheDocument()
    expect(screen.getByTestId('avatar-sphinx')).toBeInTheDocument()
  })

  it('falls back to the initial-letter avatar when no avatar id is set', () => {
    render(
      <PlayerCard
        seat="P1"
        profile={{ displayName: 'Ana', avatarId: null, rating: 1200 }}
        isYou={false}
        active={false}
        clock={null}
      />,
    )
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('A')
  })

  it('shows "Guest" for your own seat when unclaimed, with no rating badge', () => {
    render(<PlayerCard seat="P1" profile={null} isYou={true} active={false} clock={null} />)
    expect(screen.getByText('Guest')).toBeInTheDocument()
    expect(screen.queryByText('1200')).toBeNull()
  })

  it('shows "Waiting for opponent…" for the other seat when unclaimed', () => {
    render(<PlayerCard seat="P2" profile={null} isYou={false} active={false} clock={null} />)
    expect(screen.getByText('Waiting for opponent…')).toBeInTheDocument()
  })

  it('highlights the card whose turn is active', () => {
    render(<PlayerCard seat="P1" profile={profile} isYou={false} active={true} clock={null} />)
    expect(screen.getByTestId('player-card-P1').className).toMatch(/ring-sky-500/)
  })

  it('renders no clock face when the game has no time control', () => {
    render(<PlayerCard seat="P1" profile={profile} isYou={false} active={false} clock={null} />)
    expect(screen.queryByTestId('clock-P1')).toBeNull()
  })

  it('renders its own ClockFace fed by the clock prop, without ticking itself', () => {
    render(
      <PlayerCard
        seat="P1"
        profile={profile}
        isYou={false}
        active={true}
        clock={{ isDaily: false, remainingMs: 90_000 }}
      />,
    )
    expect(screen.getByTestId('clock-P1')).toHaveTextContent('1:30')
  })
})
