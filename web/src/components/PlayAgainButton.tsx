import { cn } from '../ui/cn'
import { useGame } from '../store'

/**
 * Sits in the same top-right slot `ResignButton` occupies once it renders nothing (game over),
 * sized to match it. Appears only after `WinOverlay` has been dismissed — see `overlayDismissed`
 * on `GameStore` — so a click-away doesn't leave the board with no way to start a rematch without
 * reopening the dialog. Disabled in a seated multiplayer room, the same restriction the overlay's
 * own "Play again" button applies.
 */
export function PlayAgainButton({ className }: { className?: string }) {
  const status = useGame((s) => s.status)
  const overlayDismissed = useGame((s) => s.overlayDismissed)
  const seat = useGame((s) => s.seat)
  const busy = useGame((s) => s.busy)
  const playAgain = useGame((s) => s.playAgain)

  const won = status === 'P1Win' || status === 'P2Win'
  if (!won || !overlayDismissed) return null

  return (
    <button
      type="button"
      onClick={playAgain}
      disabled={busy || seat !== null}
      title={seat !== null ? 'Leave the room to start a new game' : undefined}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium shadow-sm transition-colors',
        'bg-surface-raised/90 text-accent ring-1 ring-border hover:bg-surface-raised',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      Play again
    </button>
  )
}
