import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PlayOutletContext } from '../layout/AppLayout'
import { LandingPage } from './LandingPage'

function renderLanding(openPlayMenu: () => void) {
  const context: PlayOutletContext = {
    openSettings: () => {},
    settingsOpen: false,
    openBugReport: () => {},
    openPlayMenu,
  }
  // A bare `Outlet` stands in for `AppLayout`, same as PlayScreen.test.tsx.
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/how-to-play" element={<h1>How to play page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it("has a Play button that opens the phone's play chooser", () => {
    const openPlayMenu = vi.fn()
    renderLanding(openPlayMenu)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(openPlayMenu).toHaveBeenCalledOnce()
  })

  it('has a How to play button that opens the rules page', () => {
    renderLanding(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'How to play' }))

    expect(screen.getByRole('heading', { name: 'How to play page' })).toBeInTheDocument()
  })
})
