import * as RadixDialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { UserProfile } from '../api/authTypes'
import { Logo } from './Logo'
import { MobileTabBar, type MobileTab } from './MobileTabBar'
import { PlaySheet } from './PlaySheet'
import { Sidebar, type SidebarActions } from './Sidebar'

/** Which tab a route belongs to, for the highlight. A replay is opened from the archive, so it
 *  stays under Archive. Anything else (the landing page, profile, admin) lights up no tab. */
function tabForPath(pathname: string): MobileTab | null {
  if (pathname === '/play' || pathname.startsWith('/play/')) return 'play'
  if (pathname === '/friends') return 'friends'
  if (pathname === '/archive' || pathname.startsWith('/replay/')) return 'archive'
  if (pathname === '/leaderboard') return 'leaderboard'
  return null
}

/**
 * All of the phone's navigation chrome. Below `md` the desktop `Sidebar` rail is hidden, and this
 * renders:
 * - a sticky top bar with the wordmark, which stays put while a page scrolls. Its right end is
 *   left clear on purpose: `PendingInvitesTray`'s fixed bell sits there, above this bar. A menu
 *   button used to live in that corner and the bell covered it completely, leaving a phone with
 *   no way into the nav at all.
 * - `MobileTabBar` at the bottom: Play / Friends / Archive / Leaderboard / More.
 * - the More drawer, holding the same `Sidebar` (always `full` variant). Every nav action closes
 *   it first.
 * - `PlaySheet`, the Play tab's chooser. Its open state lives in `AppLayout`, because the
 *   landing page's Play button opens it too (via the outlet context).
 */
export function MobileNav({
  seated,
  user,
  pathname,
  playMenuOpen,
  onPlayMenuChange,
  onReturnToGame,
  ...actions
}: SidebarActions & {
  seated: boolean
  user: UserProfile
  pathname: string
  playMenuOpen: boolean
  onPlayMenuChange: (open: boolean) => void
  onReturnToGame: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const close = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    setMenuOpen(false)
    fn(...a)
  }
  const wrapped: SidebarActions = {
    onLocalPlay: close(actions.onLocalPlay),
    onPlayBot: close(actions.onPlayBot),
    onHostGame: close(actions.onHostGame),
    onGameArchive: close(actions.onGameArchive),
    onSettings: close(actions.onSettings),
    onFriends: close(actions.onFriends),
    onLeaderboard: close(actions.onLeaderboard),
    onAdmin: close(actions.onAdmin),
    onProfile: close(actions.onProfile),
    onLogout: close(actions.onLogout),
  }

  return (
    <>
      <div
        // pt- covers the notch/status-bar area in the installed (standalone) PWA window; falls
        // back to the plain py-2 top spacing wherever env(safe-area-inset-top) is 0. h-10 matches
        // the bell's height so the two line up.
        className="sticky top-0 z-30 flex items-center border-b border-border bg-surface px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden"
      >
        <div className="flex h-10 items-center">
          <Logo withWordmark size="sm" />
        </div>
      </div>

      <MobileTabBar
        active={tabForPath(pathname)}
        onPlay={() => onPlayMenuChange(true)}
        onFriends={actions.onFriends}
        onArchive={actions.onGameArchive}
        onLeaderboard={actions.onLeaderboard}
        onMore={() => setMenuOpen(true)}
      />

      <RadixDialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <RadixDialog.Content
            aria-label="Menu"
            aria-describedby={undefined}
            // The drawer runs the full screen height, so in the installed (standalone) window its
            // top would sit under the status bar and its bottom (Logout) under the home indicator —
            // pad by the insets, with bg-surface so the padding matches the Sidebar it wraps.
            className="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-xl focus:outline-none"
          >
            <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
            <Sidebar variant="full" className="min-h-full w-full" seated={seated} user={user} {...wrapped} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <PlaySheet
        open={playMenuOpen}
        onOpenChange={onPlayMenuChange}
        seated={seated}
        onPlayRoute={pathname === '/play'}
        onLocalPlay={actions.onLocalPlay}
        onPlayBot={actions.onPlayBot}
        onHostGame={actions.onHostGame}
        onReturnToGame={onReturnToGame}
      />
    </>
  )
}
