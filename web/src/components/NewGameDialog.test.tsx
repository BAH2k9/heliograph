import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewGameDialog } from './NewGameDialog'

describe('NewGameDialog', () => {
  it('offers exactly Dawn, Zenith and Dusk, defaulting to Dawn, and confirms with the chosen pair', () => {
    const onConfirm = vi.fn()
    render(<NewGameDialog open actionLabel="New game" onConfirm={onConfirm} onClose={() => {}} />)

    expect(screen.getByLabelText('Layout')).toHaveValue('Dawn')
    const layoutOptions = Array.from((screen.getByLabelText('Layout') as HTMLSelectElement).options).map((o) => o.value)
    expect(layoutOptions).toEqual(['Dawn', 'Zenith', 'Dusk'])

    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'Zenith' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))

    expect(onConfirm).toHaveBeenCalledWith({ ruleset: 'FixedSun', layout: 'Zenith' })
  })

  it('offers the same three setups under the rotating-laser ruleset', () => {
    const onConfirm = vi.fn()
    render(<NewGameDialog open actionLabel="New game" onConfirm={onConfirm} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'TurningSun' } })

    const layoutOptions = Array.from((screen.getByLabelText('Layout') as HTMLSelectElement).options).map((o) => o.value)
    expect(layoutOptions).toEqual(['Dawn', 'Zenith', 'Dusk'])

    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'Dusk' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(onConfirm).toHaveBeenCalledWith({ ruleset: 'TurningSun', layout: 'Dusk' })
  })

  it('keeps the chosen setup when the ruleset changes', () => {
    const onConfirm = vi.fn()
    render(
      <NewGameDialog
        open
        actionLabel="New game"
        initialRuleset="Classic"
        initialLayout="Dusk"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    expect(screen.getByLabelText('Layout')).toHaveValue('Dusk')

    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'TurningSun' } })
    expect(screen.getByLabelText('Layout')).toHaveValue('Dusk')
  })

  it('falls back to the default setup when handed a retired layout name', () => {
    render(
      <NewGameDialog
        open
        actionLabel="New game"
        initialLayout="RetiredLayout"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByLabelText('Layout')).toHaveValue('Dawn')
  })
})
