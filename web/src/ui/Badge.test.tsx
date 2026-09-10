import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders its content with the variant class', () => {
    render(<Badge variant="success">1500</Badge>)
    const badge = screen.getByText('1500')
    expect(badge).toHaveClass('text-success')
  })
})
