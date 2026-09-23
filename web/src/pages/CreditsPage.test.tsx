import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CreditsPage } from './CreditsPage'

describe('CreditsPage', () => {
  it('lists the self-hosted font and its licence', () => {
    render(<CreditsPage />)
    expect(screen.getByRole('link', { name: 'Fraunces' })).toBeInTheDocument()
    expect(screen.getByText('SIL Open Font License 1.1')).toBeInTheDocument()
  })

  it('lists the main runtime libraries with their licences', () => {
    render(<CreditsPage />)
    expect(screen.getByRole('link', { name: 'React' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '@microsoft/signalr' })).toBeInTheDocument()
    expect(screen.getAllByText('MIT').length).toBeGreaterThan(0)
  })

  it('points at THIRD_PARTY_NOTICES.md for the full list', () => {
    render(<CreditsPage />)
    expect(screen.getByText(/THIRD_PARTY_NOTICES\.md/)).toBeInTheDocument()
  })
})
