import { cn } from '../ui/cn'
import { useGame } from '../store'
import { useConfirmClick } from './useResignConfirm'

/**
 * Sits next to `ResignButton` for Local Play and bot games only — instantly ends the current game
 * and starts a fresh one in the same variant (same bot difficulty/seat for a bot game), via the
 * store's `restartGame`. Never rendered for a real multiplayer room: the other seat there is a
 * person mid-game, so ending it out from under them isn't this button's job — a room "play again"
 * is the post-win rematch flow (`PlayAgainButton`) instead. Same two-step inline arm/confirm as
 * `ResignButton` (`useConfirmClick`), since this is just as destructive to the in-progress game.
 */
export function RestartGameButton({ className }: { className?: string }) {
  const isLocal = useGame((s) => s.isLocal)
  const botSeat = useGame((s) => s.botSeat)
  const status = useGame((s) => s.status)
  const restartGame = useGame((s) => s.restartGame)

  const canRestart = (isLocal || botSeat !== null) && status === 'InProgress'
  const { armed, handleClick, handleBlur } = useConfirmClick(canRestart, () => void restartGame())

  if (!canRestart) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={handleBlur}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium shadow-sm transition-colors',
        armed
          ? 'bg-accent text-accent-fg hover:bg-accent/90'
          : 'bg-surface-raised/90 text-text-muted ring-1 ring-border hover:bg-surface-raised',
        className,
      )}
    >
      {armed ? 'Restart game?' : 'Play again'}
    </button>
  )
}
