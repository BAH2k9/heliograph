import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewGameDialog } from './NewGameDialog'

describe('NewGameDialog', () => {
  it('offers the Classic layouts by default and confirms with the chosen pair', () => {
    const onConfirm = vi.fn()
    render(<NewGameDialog open actionLabel="New game" onConfirm={onConfirm} onClose={() => {}} />)

    expect(screen.getByRole('option', { name: 'Imhotep' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dynasty' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'Imhotep' } })
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))

    expect(onConfirm).toHaveBeenCalledWith({ ruleset: 'Classic', layout: 'Imhotep' })
  })

  it('shows the Khet 2.0 layout too, defaulting to it when the ruleset switches', () => {
    const onConfirm = vi.fn()
    render(<NewGameDialog open actionLabel="New game" onConfirm={onConfirm} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'Khet2' } })

    expect(screen.getByLabelText('Layout')).toHaveValue('Khet2Classic')
    expect(screen.queryByRole('option', { name: 'Imhotep' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(onConfirm).toHaveBeenCalledWith({ ruleset: 'Khet2', layout: 'Khet2Classic' })
  })

  it('resets to a Classic layout when switching the ruleset back', () => {
    const onConfirm = vi.fn()
    render(
      <NewGameDialog
        open
        actionLabel="New game"
        initialRuleset="Classic"
        initialLayout="Dynasty"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    )
    expect(screen.getByLabelText('Layout')).toHaveValue('Dynasty')

    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'Khet2' } })
    fireEvent.change(screen.getByLabelText('Ruleset'), { target: { value: 'Classic' } })

    expect(screen.getByLabelText('Layout')).toHaveValue('Classic')
  })
})
