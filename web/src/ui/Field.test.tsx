import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Room code" defaultValue="ABC" />)
    expect(screen.getByLabelText('Room code')).toHaveValue('ABC')
  })

  it('shows a hint, but replaces it with the error and marks the input invalid', () => {
    const { rerender } = render(<Field label="Email" hint="We never share it" />)
    expect(screen.getByText('We never share it')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')

    rerender(<Field label="Email" hint="We never share it" error="Required" />)
    expect(screen.queryByText('We never share it')).toBeNull()
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })
})
