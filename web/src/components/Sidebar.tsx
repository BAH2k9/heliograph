import type { ReactNode } from 'react'
import { Logo } from './Logo'

export interface SidebarActions {
  onLocalPlay: () => void
  onHostGame: () => void
  onJoinGame: () => void
  onGameArchive: () => void
  onSettings: () => void
}

/**
 * The persistent left nav. `full` (landing) shows icon + label rows under a wordmarked
 * logo; `icon` (in-play) shrinks to a mark-only rail with tooltips, so the board reads
 * as the focal point once a game is under way.
 */
export function Sidebar({
  variant,
  seated,
  onLocalPlay,
  onHostGame,
  onJoinGame,
  onGameArchive,
  onSettings,
}: SidebarActions & { variant: 'full' | 'icon'; seated: boolean }) {
  const full = variant === 'full'
  const seatedTitle = seated ? 'Leave the room to start a new game' : undefined

  return (
    <nav
      className={[
        'flex shrink-0 flex-col gap-1 border-r border-slate-800 bg-slate-900 py-4',
        full ? 'w-56 px-3' : 'w-16 items-center px-2',
      ].join(' ')}
    >
      <div className={full ? 'mb-6 px-1' : 'mb-6'}>
        <Logo withWordmark={full} size="sm" />
      </div>

      <NavItem full={full} label="Local Play" disabled={seated} title={seatedTitle} onClick={onLocalPlay}>
        <PlayIcon />
      </NavItem>
      <NavItem full={full} label="Host Game" disabled={seated} title={seatedTitle} onClick={onHostGame}>
        <HostIcon />
      </NavItem>
      <NavItem full={full} label="Join Game" onClick={onJoinGame}>
        <JoinIcon />
      </NavItem>
      <NavItem full={full} label="Game Archive" onClick={onGameArchive}>
        <ArchiveIcon />
      </NavItem>
      <NavItem full={full} label="Settings" onClick={onSettings}>
        <SettingsIcon />
      </NavItem>
    </nav>
  )
}

function NavItem({
  full,
  label,
  disabled,
  title,
  onClick,
  children,
}: {
  full: boolean
  label: string
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={full ? title : (title ?? label)}
      aria-label={label}
      className={[
        'flex items-center gap-3 rounded text-sm text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent',
        full ? 'px-3 py-2' : 'justify-center p-2.5',
      ].join(' ')}
    >
      <span className="h-5 w-5 shrink-0">{children}</span>
      {full && <span>{label}</span>}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function HostIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M2.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 4.5a3 3 0 0 1 0 6.9" />
      <path d="M15.5 13.3c2.6.4 4.4 1.9 4.9 4.2" />
    </svg>
  )
}

function JoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M11 8l4 4-4 4" />
      <path d="M15 12H3" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1s-.08.69-.22 1z" />
    </svg>
  )
}
