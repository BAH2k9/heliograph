import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RULESETS } from '../game/gamePresets'
import { HowToPlayPage } from './HowToPlayPage'

describe('HowToPlayPage', () => {
  it('has one tab per ruleset, in catalog order', () => {
    render(<HowToPlayPage />)

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(RULESETS.map((r) => r.label))
  })

  it('opens on Fixed Sun, with its stacking rules and no Turning Sun pieces', () => {
    render(<HowToPlayPage />)

    expect(screen.getByRole('tab', { name: 'Fixed Sun' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Stacking and splitting Bastions' })).toBeInTheDocument()
    expect(screen.getByText('Bastion')).toBeInTheDocument()
    expect(screen.queryByText('Sentinel')).toBeNull()
    expect(screen.queryByText('Heliostat')).toBeNull()
  })

  it('switches to the Turning Sun guide: Heliostat and Sentinels, no Bastions', () => {
    render(<HowToPlayPage />)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Turning Sun' }))

    expect(screen.getByRole('heading', { name: 'Sentinels' })).toBeInTheDocument()
    expect(screen.getByText('Sentinel')).toBeInTheDocument()
    expect(screen.getByText('Heliostat')).toBeInTheDocument()
    expect(screen.queryByText('Bastion')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Stacking and splitting Bastions' })).toBeNull()
  })

  it('explains all three ways to start a game', () => {
    render(<HowToPlayPage />)

    for (const way of ['Local Play', 'Play Bot', 'Challenge a Friend']) {
      expect(screen.getByRole('heading', { name: way })).toBeInTheDocument()
    }
  })
})
