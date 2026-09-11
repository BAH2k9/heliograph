import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar, type SidebarActions } from './Sidebar'
import type { UserProfile } from '../api/authTypes'
import { defaultRatings } from '../test/authFixtures'

const user: UserProfile = { id: 'u1', email: 'a@b.com', displayName: 'Ana', ratings: defaultRatings() }

function actions(): SidebarActions {
  return {
    onLocalPlay: vi.fn(),
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

describe('Sidebar', () => {
  it('shows Login/Register and hides Leaderboard for a guest', () => {
    const acts = actions()
    render(<Sidebar variant="full" seated={false} user={null} {...acts} />)

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leaderboard' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(acts.onLogin).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(acts.onRegister).toHaveBeenCalledOnce()
  })

  it('shows the display name, Logout, and Leaderboard for a logged-in account', () => {
    const acts = actions()
    render(<Sidebar variant="full" seated={false} user={user} {...acts} />)

    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leaderboard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull()

    fireEvent.click(screen.getByText('Ana'))
    expect(acts.onProfile).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(acts.onLogout).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }))
    expect(acts.onLeaderboard).toHaveBeenCalledOnce()
  })
})
