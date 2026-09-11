import type { Player, PlayerSummary } from '../api/types'
import { cn } from '../ui/cn'
import { Avatar } from './Avatar'
import { ClockFace, type ClockDisplay } from './GameClock'

/**
 * A compact chess.com-style player strip: a turn indicator, avatar, name (or a fallback when the
 * seat has no attached account), rating, and — if the game is timed — that seat's `ClockFace`.
 * Rendered twice in `PlayScreen` at fixed positions (Red/P2 top, Silver/P1 bottom); the clock
 * ticking itself lives entirely in `useClockAutoClaim` (mounted once by the caller) — this
 * component only ever renders the number it's handed.
 *
 * `isYou` picks between the two null-profile fallback labels: "Guest" for the local seat (an
 * anonymous room game nobody's claimed yet) vs. "Waiting for opponent…" for the other seat (game
 * exists, that seat just hasn't been taken/claimed). Local/solo play and spectating have no real
 * "opponent" seat at all, so the caller passes `isYou: true` for both in that case.
 */
export function PlayerCard({
  seat,
  profile,
  isYou,
  active,
  clock,
}: {
  seat: Player
  profile: PlayerSummary | null
  isYou: boolean
  active: boolean
  clock: ClockDisplay | null
}) {
  const name = profile?.displayName ?? (isYou ? 'Guest' : 'Waiting for opponent…')

  return (
    <div
      data-testid={`player-card-${seat}`}
      className={cn(
        'flex w-full max-w-xs items-center gap-2.5 rounded-md px-2.5 py-1.5 ring-1 transition-colors',
        active ? 'bg-accent/10 ring-2 ring-accent' : 'bg-surface-raised/60 ring-border',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 shrink-0 rounded-full transition-colors',
          active ? 'animate-pulse bg-accent shadow-[0_0_8px_1px] shadow-accent/60' : 'bg-border-strong',
        )}
      />
      <Avatar avatarId={profile?.avatarId} displayName={name} size="sm" />
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium text-text">{name}</span>
        {profile && <span className="shrink-0 text-xs tabular-nums text-text-muted">{profile.rating}</span>}
      </div>
      {clock && <ClockFace player={seat} active={active} isDaily={clock.isDaily} remainingMs={clock.remainingMs} />}
    </div>
  )
}
