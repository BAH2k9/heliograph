import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar, type SidebarActions } from './Sidebar'
import type { UserProfile } from '../api/authTypes'
import { defaultRatings } from '../test/authFixtures'

const user: UserProfile = { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() }

function actions(): SidebarActions {
  return {
    onLocalPlay: vi.fn(),
    onPlayBot: vi.fn(),
    onHostGame: vi.fn(),
    onGameArchive: vi.fn(),
    onSettings: vi.fn(),
    onFriends: vi.fn(),
    onLeaderboard: vi.fn(),
    onAdmin: vi.fn(),
    onProfile: vi.fn(),
    onLogout: vi.fn(),
  }
}

// The logo is a router Link, so every render needs a router. `/` stands in for the landing page.
function renderAt(path: string, sidebar: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {sidebar}
      <Routes>
        <Route path="/" element={<p>landing page stub</p>} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  it('shows the display name, Logout, and Leaderboard for the logged-in account', () => {
    const acts = actions()
    renderAt('/', <Sidebar variant="full" seated={false} user={user} {...acts} />)

    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leaderboard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull()

    fireEvent.click(screen.getByText('Ana'))
    expect(acts.onProfile).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(acts.onLogout).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }))
    expect(acts.onLeaderboard).toHaveBeenCalledOnce()
  })

  it('shows Admin only for an admin account', () => {
    const acts = actions()
    renderAt('/', <Sidebar variant="full" seated={false} user={{ ...user, isAdmin: true }} {...acts} />)

    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    expect(acts.onAdmin).toHaveBeenCalledOnce()
  })

  it.each(['full', 'icon'] as const)('takes the %s variant logo back to the landing page', (variant) => {
    const onLogoClick = vi.fn()
    renderAt('/leaderboard', <Sidebar variant={variant} seated={false} user={user} onLogoClick={onLogoClick} {...actions()} />)
    expect(screen.queryByText('landing page stub')).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Heliograph home' }))

    expect(screen.getByText('landing page stub')).toBeInTheDocument()
    expect(onLogoClick).toHaveBeenCalledOnce()
  })
})
