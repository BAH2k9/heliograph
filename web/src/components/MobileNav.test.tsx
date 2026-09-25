import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MobileNav } from './MobileNav'
import type { SidebarActions } from './Sidebar'
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

function renderNav(overrides: Partial<Parameters<typeof MobileNav>[0]> = {}) {
  const acts = actions()
  const onPlayMenuChange = vi.fn()
  // The wordmark is a router Link, so MobileNav needs a router. `/` stands in for the landing page.
  render(
    <MemoryRouter initialEntries={[overrides.pathname ?? '/']}>
      <MobileNav
        seated={false}
        user={user}
        pathname="/"
        playMenuOpen={false}
        onPlayMenuChange={onPlayMenuChange}
        onReturnToGame={vi.fn()}
        {...acts}
        {...overrides}
      />
      <Routes>
        <Route path="/" element={<p>landing page stub</p>} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  )
  const tabBar = screen.getByRole('navigation', { name: 'Main' })
  return { acts, onPlayMenuChange, tabBar }
}

describe('MobileNav', () => {
  it('keeps the drawer closed until More is pressed', () => {
    const { tabBar } = renderNav()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()

    fireEvent.click(within(tabBar).getByRole('button', { name: 'More' }))

    const drawer = screen.getByRole('dialog', { name: 'Menu' })
    expect(within(drawer).getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('fires the nav action and closes the drawer on selection', () => {
    const { acts, tabBar } = renderNav()

    fireEvent.click(within(tabBar).getByRole('button', { name: 'More' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Settings' }))

    expect(acts.onSettings).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })

  it('routes the Friends / Archive / Leaderboard tabs straight to their pages', () => {
    const { acts, tabBar } = renderNav()

    fireEvent.click(within(tabBar).getByRole('button', { name: 'Friends' }))
    fireEvent.click(within(tabBar).getByRole('button', { name: 'Archive' }))
    fireEvent.click(within(tabBar).getByRole('button', { name: 'Leaderboard' }))

    expect(acts.onFriends).toHaveBeenCalledOnce()
    expect(acts.onGameArchive).toHaveBeenCalledOnce()
    expect(acts.onLeaderboard).toHaveBeenCalledOnce()
  })

  it('opens the play chooser from the Play tab instead of starting a game', () => {
    const { acts, onPlayMenuChange, tabBar } = renderNav()

    fireEvent.click(within(tabBar).getByRole('button', { name: 'Play' }))

    expect(onPlayMenuChange).toHaveBeenCalledWith(true)
    expect(acts.onLocalPlay).not.toHaveBeenCalled()
  })

  it.each([
    ['/friends', 'Friends'],
    ['/leaderboard', 'Leaderboard'],
    ['/archive', 'Archive'],
    // A replay is opened from the archive, so it stays under that tab.
    ['/replay/g1', 'Archive'],
    ['/play', 'Play'],
    ['/play/invite', 'Play'],
  ])('marks the tab for %s as the current page', (pathname, tab) => {
    const { tabBar } = renderNav({ pathname })

    const current = within(tabBar)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current.map((b) => b.textContent)).toEqual([tab])
  })

  it('marks no tab on a page outside the tab set', () => {
    const { tabBar } = renderNav({ pathname: '/profile' })

    expect(within(tabBar).getAllByRole('button').some((b) => b.hasAttribute('aria-current'))).toBe(false)
  })

  it('takes the top bar wordmark back to the landing page', () => {
    renderNav({ pathname: '/leaderboard' })
    expect(screen.queryByText('landing page stub')).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Heliograph home' }))

    expect(screen.getByText('landing page stub')).toBeInTheDocument()
  })

  it('closes the drawer when its logo takes you to the landing page', () => {
    const { tabBar } = renderNav({ pathname: '/leaderboard' })

    fireEvent.click(within(tabBar).getByRole('button', { name: 'More' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('link', { name: 'Heliograph home' }))

    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
    expect(screen.getByText('landing page stub')).toBeInTheDocument()
  })

  it('keeps the top bar free of buttons, since the notifications bell floats in its corner', () => {
    renderNav()

    // The only buttons MobileNav renders are the five tabs. Anything added to the top bar's
    // right end would sit under PendingInvitesTray's fixed bell again.
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })
})
