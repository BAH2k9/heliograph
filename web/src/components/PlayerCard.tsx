import type { Player, PlayerSummary } from '../api/types'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { Avatar } from './Avatar'
import { ClockFace, type ClockDisplay } from './GameClock'

/**
 * A chess.com-style player strip: avatar, name (or a fallback when the seat has no attached
 * account), rating badge, and — if the game is timed — that seat's `ClockFace`. Rendered twice in
 * `PlayScreen`, once per seat; the clock ticking itself lives entirely in `useClockAutoClaim`
 * (mounted once by the caller) — this component only ever renders the number it's handed.
 *
 * `isYou` picks between the two null-profile fallback labels: "Guest" for the local seat (an
 * anonymous room game nobody's claimed yet) vs. "Waiting for opponent…" for the other seat (game
 * exists, that seat just hasn't been taken/claimed). Local/solo play and spectating have no real
 * "opponent" seat at all, so the caller passes `isYou: true` for both in that case — "Guest" reads
 * fine for a seat nobody's logged into either way.
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
        'flex items-center justify-between gap-3 rounded-lg bg-surface-raised px-3 py-2 ring-1 transition-colors',
        active ? 'ring-2 ring-accent' : 'ring-border',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar avatarId={profile?.avatarId} displayName={name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{name}</p>
          {profile && <Badge variant="accent">{profile.rating}</Badge>}
        </div>
      </div>
      {clock && <ClockFace player={seat} active={active} isDaily={clock.isDaily} remainingMs={clock.remainingMs} />}
    </div>
  )
}
