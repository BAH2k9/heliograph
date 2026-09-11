import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileNav } from './MobileNav'
import type { SidebarActions } from './Sidebar'

function actions(): SidebarActions {
  return {
    onLocalPlay: vi.fn(),
    onPlayBot: vi.fn(),
    onHostGame: vi.fn(),
    onJoinGame: vi.fn(),
    onGameArchive: vi.fn(),
    onSettings: vi.fn(),
    onFriends: vi.fn(),
    onLeaderboard: vi.fn(),
    onAdmin: vi.fn(),
    onProfile: vi.fn(),
    onLogin: vi.fn(),
    onRegister: vi.fn(),
    onLogout: vi.fn(),
  }
}

describe('MobileNav', () => {
  it('keeps the drawer closed until the menu button is pressed', () => {
    render(<MobileNav seated={false} user={null} {...actions()} />)
    expect(screen.queryByRole('button', { name: 'Local Play' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('button', { name: 'Local Play' })).toBeInTheDocument()
  })

  it('fires the nav action and closes the drawer on selection', () => {
    const acts = actions()
    render(<MobileNav seated={false} user={null} {...acts} />)

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Game Archive' }))

    expect(acts.onGameArchive).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Game Archive' })).toBeNull()
  })
})
