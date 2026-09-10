import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'

function Harness() {
  return (
    <Tabs defaultValue="blitz">
      <TabsList>
        <TabsTrigger value="blitz">Blitz</TabsTrigger>
        <TabsTrigger value="rapid">Rapid</TabsTrigger>
      </TabsList>
      <TabsContent value="blitz">blitz panel</TabsContent>
      <TabsContent value="rapid">rapid panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('shows the default panel and switches on trigger click', () => {
    render(<Harness />)
    expect(screen.getByText('blitz panel')).toBeInTheDocument()
    expect(screen.queryByText('rapid panel')).toBeNull()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Rapid' }))

    expect(screen.getByText('rapid panel')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Rapid' })).toHaveAttribute('aria-selected', 'true')
  })
})
