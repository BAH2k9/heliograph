import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RotateButtons } from './RotateButtons'

describe('RotateButtons', () => {
  it('rotate left is counter-clockwise, rotate right is clockwise', () => {
    const onRotate = vi.fn()
    render(<RotateButtons onRotate={onRotate} disabled={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }))
    expect(onRotate).toHaveBeenLastCalledWith('CCW')

    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(onRotate).toHaveBeenLastCalledWith('CW')
  })

  it('a Heliostat gets a single Flip button instead of two directions', () => {
    const onRotate = vi.fn()
    render(<RotateButtons onRotate={onRotate} disabled={false} single />)

    expect(screen.queryByRole('button', { name: 'Rotate left' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate right' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Flip' }))
    expect(onRotate).toHaveBeenCalledWith('CW')
  })

  it('does nothing while a move is in flight', () => {
    const onRotate = vi.fn()
    render(<RotateButtons onRotate={onRotate} disabled />)

    const left = screen.getByRole('button', { name: 'Rotate left' })
    const right = screen.getByRole('button', { name: 'Rotate right' })
    expect(left).toBeDisabled()
    expect(right).toBeDisabled()

    fireEvent.click(left)
    fireEvent.click(right)
    expect(onRotate).not.toHaveBeenCalled()
  })
})
