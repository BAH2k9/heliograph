import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlaySheet } from './PlaySheet'

function renderSheet(overrides: Partial<Parameters<typeof PlaySheet>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    seated: false,
    onPlayRoute: false,
    onLocalPlay: vi.fn(),
    onPlayBot: vi.fn(),
    onHostGame: vi.fn(),
    onReturnToGame: vi.fn(),
    ...overrides,
  }
  render(<PlaySheet {...props} />)
  return props
}

describe('PlaySheet', () => {
  it('offers the three ways to play, and picking one closes the sheet and starts it', () => {
    const props = renderSheet()

    expect(screen.getByRole('button', { name: 'Local Play' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Play Bot' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Challenge a Friend' }))

    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(props.onHostGame).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Return to your game' })).toBeNull()
  })

  it('blocks starting a new game while one is under way, and offers the way back to it', () => {
    const props = renderSheet({ seated: true })

    expect(screen.getByRole('button', { name: 'Local Play' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Play Bot' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Challenge a Friend' })).toBeDisabled()
    expect(screen.getByText('Resign your current game to start a new one.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Return to your game' }))
    expect(props.onReturnToGame).toHaveBeenCalledOnce()
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('drops "Return to your game" when that game is already on screen', () => {
    renderSheet({ seated: true, onPlayRoute: true })

    expect(screen.queryByRole('button', { name: 'Return to your game' })).toBeNull()
  })

  it('renders nothing while closed', () => {
    renderSheet({ open: false })

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
