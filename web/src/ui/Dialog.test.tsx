import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './Dialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent title="New game" description="Pick a ruleset">
        <p>body content</p>
        <DialogClose>Cancel</DialogClose>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('is closed until the trigger is clicked, then shows a labelled modal', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('New game')
    expect(dialog).toHaveAccessibleDescription('Pick a ruleset')
    expect(screen.getByText('body content')).toBeInTheDocument()
  })

  it('closes on Escape and via a DialogClose child', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
