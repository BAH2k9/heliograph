import type { ReactNode } from 'react'
import { ArchiveIcon, FriendsIcon, LeaderboardIcon, PlayIcon } from './Sidebar'

export type MobileTab = 'play' | 'friends' | 'archive' | 'leaderboard'

/**
 * Below `md`: the phone's primary navigation, fixed to the bottom of the screen where a thumb
 * already is. Play opens `PlaySheet` rather than navigating (starting a game is a choice of three
 * modes, not a page). More opens the full `Sidebar` drawer, which holds everything else: Settings,
 * Profile, Admin, Logout. `AppLayout` pads its content column by this bar's height so page
 * content never ends underneath it.
 */
export function MobileTabBar({
  active,
  onPlay,
  onFriends,
  onArchive,
  onLeaderboard,
  onMore,
}: {
  active: MobileTab | null
  onPlay: () => void
  onFriends: () => void
  onArchive: () => void
  onLeaderboard: () => void
  onMore: () => void
}) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
    >
      <Tab label="Play" active={active === 'play'} onClick={onPlay}>
        <PlayIcon />
      </Tab>
      <Tab label="Friends" active={active === 'friends'} onClick={onFriends}>
        <FriendsIcon />
      </Tab>
      <Tab label="Archive" active={active === 'archive'} onClick={onArchive}>
        <ArchiveIcon />
      </Tab>
      <Tab label="Leaderboard" active={active === 'leaderboard'} onClick={onLeaderboard}>
        <LeaderboardIcon />
      </Tab>
      <Tab label="More" active={false} onClick={onMore}>
        <MoreIcon />
      </Tab>
    </nav>
  )
}

function Tab({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
        active ? 'text-accent' : 'text-text-muted hover:text-text',
      ].join(' ')}
    >
      <span className="h-6 w-6 shrink-0">{children}</span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </button>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
