import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../authStore'
import { useInvites } from '../inviteStore'
import { useGame } from '../store'
import { subscribeToUserInvites } from '../realtime'
import { Avatar } from './Avatar'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Badge } from '../ui/Badge'

/**
 * The always-mounted "someone challenged you" surface (`plans/07-friend-invites-matches.md`).
 * Lives in `AppLayout` — not a `/play`-only component — so a friend's invite is visible no
 * matter what page the invitee is on. A floating bell button, fixed top-right; opens a dropdown
 * of pending invites with Join/Decline.
 *
 * `useInvites`'s `pending` list is refreshed on mount/login and on every `inviteReceived` hub
 * push (never trusting the push payload itself, which carries only an id) — see
 * `realtime.ts`'s doc comment for why the connection now opens for any authenticated user, not
 * only while a game is being followed.
 */
export function PendingInvitesTray() {
  const user = useAuth((s) => s.user)
  const pending = useInvites((s) => s.pending)
  const invitesError = useInvites((s) => s.error)
  const busyId = useInvites((s) => s.busyId)
  const refresh = useInvites((s) => s.refresh)
  const accept = useInvites((s) => s.accept)
  const decline = useInvites((s) => s.decline)
  const dismissError = useInvites((s) => s.dismissError)
  const reset = useInvites((s) => s.reset)
  const enterRoom = useGame((s) => s.enterRoom)
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) {
      reset()
      void subscribeToUserInvites(null)
      return
    }
    void refresh()
    void subscribeToUserInvites(() => void refresh())
    return () => {
      void subscribeToUserInvites(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!user) return null

  async function handleAccept(inviteId: string) {
    const room = await accept(inviteId)
    if (room) {
      setOpen(false)
      await enterRoom(room)
      navigate('/play')
    }
  }

  return (
    <div ref={containerRef} className="fixed right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-40">
      <button
        type="button"
        aria-label="Pending invites"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-text-muted ring-1 ring-border transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <BellIcon />
        {pending.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
            {pending.length}
          </span>
        )}
      </button>

      {open && (
        <Panel className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] p-3">
          <h2 className="mb-2 text-sm font-semibold text-text">Match invites</h2>
          {invitesError && <p className="mb-2 text-xs text-danger">{invitesError}</p>}
          {pending.length === 0 ? (
            <p className="text-sm text-text-muted">No pending invites.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2">
                  <Avatar avatarId={inv.inviterAvatarId} displayName={inv.inviterDisplayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {inv.inviterDisplayName}
                      <span className="text-text-subtle">#{inv.inviterDiscriminator}</span>
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Badge>{inv.ruleset}</Badge>
                      {inv.timeControl && <Badge>{inv.timeControl}</Badge>}
                      {inv.rated && <Badge variant="accent">Rated</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="sm" disabled={busyId === inv.id} onClick={() => void handleAccept(inv.id)}>
                      Join
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === inv.id}
                      onClick={() => void decline(inv.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {invitesError && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={dismissError}>
              dismiss
            </Button>
          )}
        </Panel>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}
