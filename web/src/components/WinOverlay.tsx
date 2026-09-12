import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { Button } from '../ui/Button'
import { useGame } from '../store'

/**
 * Shown once a game-ending move's animation has fully played (see `overlayReady` on
 * `GameStore`). Announces the winner and offers "Play again"; "View board" dismisses it (setting
 * `overlayDismissed` on the store) so the final position (and the status banner) stay visible —
 * and so `PlayAgainButton` can pick up the rematch offer in the same slot `ResignButton` used.
 *
 * Mount this with `key={gameId}` so a new game gives `playAgainRef`'s focus effect a clean start;
 * `overlayDismissed` itself resets via `freshBoardState` on every fresh game load.
 */
export function WinOverlay() {
  const status = useGame((s) => s.status)
  const endReason = useGame((s) => s.endReason)
  const moveCount = useGame((s) => s.moveCount)
  const busy = useGame((s) => s.busy)
  const seat = useGame((s) => s.seat)
  const overlayReady = useGame((s) => s.overlayReady)
  const overlayDismissed = useGame((s) => s.overlayDismissed)
  const dismissOverlay = useGame((s) => s.dismissOverlay)
  const playAgain = useGame((s) => s.playAgain)

  const playAgainRef = useRef<HTMLButtonElement>(null)

  const won = status === 'P1Win' || status === 'P2Win'
  // `overlayReady` holds this back until the game-ending move's animation (including the extra
  // Pharaoh-death beat) has actually finished — see its doc on `GameStore`.
  const open = won && overlayReady && !overlayDismissed

  useEffect(() => {
    if (!open) return
    playAgainRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismissOverlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissOverlay])

  // Same "by timeout"/"by resignation" qualifier as the archive/profile status labels — an
  // ordinary Pharaoh-elimination win gets none.
  const qualifier =
    endReason === 'Timeout' ? ' · by timeout' : endReason === 'Resignation' ? ' · by resignation' : ''
  const winner =
    status === 'P1Win'
      ? { label: `Silver (P1) wins${qualifier}`, accent: 'text-text' }
      : { label: `Red (P2) wins${qualifier}`, accent: 'text-danger' }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-[1px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={dismissOverlay}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-overlay-title"
            className="w-full max-w-sm rounded-lg bg-surface-raised p-6 text-center text-text shadow-xl ring-1 ring-border"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">Game over</p>
            <h2 id="win-overlay-title" className={`mt-1 text-2xl font-semibold ${winner.accent}`}>
              {winner.label}
            </h2>
            <p className="mt-1 text-sm text-text-muted">on move {moveCount}</p>

            <div className="mt-6 flex justify-center gap-2">
              <Button
                ref={playAgainRef}
                size="sm"
                onClick={playAgain}
                disabled={busy || seat !== null}
                title={seat !== null ? 'Leave the room to start a new game' : undefined}
              >
                Play again
              </Button>
              <Button variant="ghost" size="sm" onClick={dismissOverlay}>
                View board
              </Button>
            </div>
            {seat !== null && (
              <p className="mt-3 text-xs text-text-subtle">Leave the room to start a new game.</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
