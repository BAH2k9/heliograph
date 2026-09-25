import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { Player } from '../api/types'
import { useAuth } from '../authStore'
import { SIDE_NAMES } from '../game/displayNames'
import { Button } from '../ui/Button'
import { useGame } from '../store'
import { botPersonaFor } from './botPersonas'

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
  const overlayReady = useGame((s) => s.overlayReady)
  const overlayDismissed = useGame((s) => s.overlayDismissed)
  const rematchRequestedByMe = useGame((s) => s.rematchRequestedByMe)
  const dismissOverlay = useGame((s) => s.dismissOverlay)
  const playAgain = useGame((s) => s.playAgain)
  const gameId = useGame((s) => s.gameId)
  const p1Profile = useGame((s) => s.p1Profile)
  const p2Profile = useGame((s) => s.p2Profile)
  const botSeat = useGame((s) => s.botSeat)
  const authUser = useAuth((s) => s.user)

  const playAgainRef = useRef<HTMLButtonElement>(null)

  const won = status === 'P1Win' || status === 'P2Win'
  // `overlayReady` holds this back until the game-ending move's animation (including the extra
  // Keep-death beat) has actually finished — see its doc on `GameStore`.
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
  // ordinary Keep-elimination win gets none.
  const qualifier =
    endReason === 'Timeout' ? ' · by timeout' : endReason === 'Resignation' ? ' · by resignation' : ''
  const winnerSeat: Player = status === 'P1Win' ? 'P1' : 'P2'
  // Lead with the name the player cards show; the heading's colour already says which side won,
  // so the side isn't repeated underneath. A seat with no name to show (an anonymous room seat)
  // falls back to the side's name.
  const winner = {
    label: `${nameFor(winnerSeat) ?? SIDE_NAMES[winnerSeat]} wins${qualifier}`,
    detail: `on move ${moveCount}`,
    accent: winnerSeat === 'P1' ? 'text-side-p1' : 'text-side-p2',
  }

  /** The identity `PlayScreen`'s player cards render for a seat — see its `playerSummaryFor`. */
  function nameFor(s: Player): string | null {
    if (botSeat === s) return botPersonaFor(gameId ?? s).displayName
    if (botSeat !== null) return authUser?.displayName ?? null
    return (s === 'P1' ? p1Profile : p2Profile)?.displayName ?? null
  }

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
            <p className="mt-1 text-sm text-text-muted">{winner.detail}</p>

            <div className="mt-6 flex justify-center gap-2">
              <Button ref={playAgainRef} size="sm" onClick={playAgain} disabled={busy || rematchRequestedByMe}>
                {rematchRequestedByMe ? 'Waiting…' : 'Play again'}
              </Button>
              <Button variant="ghost" size="sm" onClick={dismissOverlay}>
                View board
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
