import { cn } from '../ui/cn'
import { useGame } from '../store'
import { useResignConfirm } from './useResignConfirm'

/**
 * Two-step inline resign confirm (no modal) — see `useResignConfirm` for the arm/confirm/revert
 * behavior shared with `ActiveGameBanner`. Renders nothing unless the viewer holds a seat in a
 * game that's still in progress — or it's Local Play (`isLocal`) or a bot game (`botSeat`),
 * neither of which has a seated player at all, so `resign()` concedes on behalf of whoever's turn
 * it is (local) or the human's own side (bot) instead. Floated over the top-right of the board by
 * `PlayScreen` for room/local play; `PlayScreen` mounts a second instance for bot games since
 * those render no player-card row for it to sit alongside.
 */
export function ResignButton({ className }: { className?: string }) {
  const seat = useGame((s) => s.seat)
  const isLocal = useGame((s) => s.isLocal)
  const botSeat = useGame((s) => s.botSeat)
  const status = useGame((s) => s.status)

  const canResign = (seat === 'P1' || seat === 'P2' || isLocal || botSeat !== null) && status === 'InProgress'
  const { armed, handleClick, handleBlur } = useResignConfirm(canResign)

  if (!canResign) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={handleBlur}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium shadow-sm transition-colors',
        armed
          ? 'bg-danger text-danger-fg hover:bg-danger/90'
          : 'bg-surface-raised/90 text-danger ring-1 ring-border hover:bg-surface-raised',
        className,
      )}
    >
      {armed ? 'Confirm resign?' : 'Resign'}
    </button>
  )
}
