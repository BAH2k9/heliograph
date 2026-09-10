import * as RadixDialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { UserProfile } from '../api/authTypes'
import { Logo } from './Logo'
import { Sidebar, type SidebarActions } from './Sidebar'

/**
 * Below `md` the fixed rail is hidden and nav lives here: a top bar with the wordmark and a
 * hamburger that opens a left drawer holding the same `Sidebar` (always `full` variant).
 * Every nav action closes the drawer first.
 */
export function MobileNav({
  seated,
  user,
  ...actions
}: SidebarActions & { seated: boolean; user: UserProfile | null }) {
  const [open, setOpen] = useState(false)

  const close = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    setOpen(false)
    fn(...a)
  }
  const wrapped: SidebarActions = {
    onLocalPlay: close(actions.onLocalPlay),
    onHostGame: close(actions.onHostGame),
    onJoinGame: close(actions.onJoinGame),
    onGameArchive: close(actions.onGameArchive),
    onSettings: close(actions.onSettings),
    onLeaderboard: close(actions.onLeaderboard),
    onProfile: close(actions.onProfile),
    onLogin: close(actions.onLogin),
    onRegister: close(actions.onRegister),
    onLogout: close(actions.onLogout),
  }

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 md:hidden">
      <Logo withWordmark size="sm" />
      <RadixDialog.Root open={open} onOpenChange={setOpen}>
        <RadixDialog.Trigger
          aria-label="Menu"
          className="rounded p-2 text-text-muted transition-colors hover:bg-white/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </RadixDialog.Trigger>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <RadixDialog.Content
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto shadow-xl focus:outline-none"
          >
            <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
            <Sidebar variant="full" className="min-h-full w-full" seated={seated} user={user} {...wrapped} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </div>
  )
}
