import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel } from './Panel'

describe('Panel', () => {
  it('renders children and merges a caller className', () => {
    render(
      <Panel className="p-4" data-testid="panel">
        inside
      </Panel>,
    )
    const panel = screen.getByTestId('panel')
    expect(panel).toHaveTextContent('inside')
    expect(panel).toHaveClass('p-4')
    expect(panel).toHaveClass('bg-surface-raised')
  })
})
