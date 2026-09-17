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
 *
 * `showRating` defaults to true; `PlayScreen` passes `false` for Local Play, whose profiles are
 * synthesized pop-culture identities with a hardcoded `rating: 0` (see `newGame` on the store) —
 * not a real rating, so showing "0" would just read as a bug. Every real room game (rated or not,
 * timed or not) shows a real rating: `GameResponseMapper.ToPlayerSummary` now always returns a
 * genuine `TimeControlCategory` bucket value — the `Untimed` bucket for a game with no time
 * control — never a `0` sentinel, so there's nothing else to gate on here.
 *
 * `onClick`, when provided, opens the in-game player-info popup (`backlog/09-player-info-popup.md`)
 * — omitted entirely (not just disabled) for an unclaimed "Waiting for opponent…" seat, since
 * there's nothing to show yet. Keyboard-activatable the same way `ProfilePage`'s game-list rows are.
 */
export function PlayerCard({
  seat,
  profile,
  isYou,
  active,
  clock,
  showRating = true,
  onClick,
}: {
  seat: Player
  profile: PlayerSummary | null
  isYou: boolean
  active: boolean
  clock: ClockDisplay | null
  showRating?: boolean
  onClick?: () => void
}) {
  const name = profile?.displayName ?? (isYou ? 'Guest' : 'Waiting for opponent…')

  return (
    <div
      data-testid={`player-card-${seat}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'flex w-full max-w-xs items-center gap-2.5 rounded-md px-2.5 py-1.5 ring-1 transition-colors',
        active ? 'bg-accent/10 ring-2 ring-accent' : 'bg-surface-raised/60 ring-border',
        onClick && 'cursor-pointer hover:bg-row-hover',
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
        {profile && showRating && (
          <span className="shrink-0 text-xs tabular-nums text-text-muted">{profile.rating}</span>
        )}
      </div>
      {clock && <ClockFace player={seat} active={active} isDaily={clock.isDaily} remainingMs={clock.remainingMs} />}
    </div>
  )
}
