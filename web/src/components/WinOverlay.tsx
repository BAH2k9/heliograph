import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'

/**
 * Shown when a game ends. Announces the winner and offers a rematch; "View board"
 * dismisses it so the final position (and the status banner) stay visible.
 *
 * Mount this with `key={gameId}` so a new game gives it a clean `dismissed` state.
 */
export function WinOverlay() {
  const status = useGame((s) => s.status)
  const endReason = useGame((s) => s.endReason)
  const moveCount = useGame((s) => s.moveCount)
  const busy = useGame((s) => s.busy)
  const seat = useGame((s) => s.seat)
  const ruleset = useGame((s) => s.ruleset)
  const layout = useGame((s) => s.layout)
  const newGame = useGame((s) => s.newGame)

  const [dismissed, setDismissed] = useState(false)
  const playAgainRef = useRef<HTMLButtonElement>(null)

  const won = status === 'P1Win' || status === 'P2Win'
  const open = won && !dismissed

  useEffect(() => {
    if (!open) return
    playAgainRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Same "by timeout"/"by resignation" qualifier as the archive/profile status labels — an
  // ordinary Pharaoh-elimination win gets none.
  const qualifier =
    endReason === 'Timeout' ? ' · by timeout' : endReason === 'Resignation' ? ' · by resignation' : ''
  const winner =
    status === 'P1Win'
      ? { label: `Silver (P1) wins${qualifier}`, accent: 'text-slate-100' }
      : { label: `Red (P2) wins${qualifier}`, accent: 'text-rose-400' }

  // Fairness convention for a rematch: whoever didn't win moves first this time.
  const loser = status === 'P1Win' ? 'P2' : 'P1'
  const rematchDisabled = busy || seat !== null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setDismissed(true)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-overlay-title"
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6 text-center shadow-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Game over</p>
            <h2 id="win-overlay-title" className={`mt-1 text-2xl font-semibold ${winner.accent}`}>
              {winner.label}
            </h2>
            <p className="mt-1 text-sm text-slate-400">on move {moveCount}</p>

            <div className="mt-5 flex justify-center gap-3">
              <button
                ref={playAgainRef}
                type="button"
                onClick={() => void newGame()}
                disabled={busy || seat !== null}
                title={seat !== null ? 'Leave the room to start a new game' : undefined}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
              >
                Play again
              </button>
              <button
                type="button"
                onClick={() => void newGame({ ruleset, layout, firstPlayer: loser })}
                disabled={rematchDisabled}
                title={
                  seat !== null
                    ? 'Leave the room to start a new game'
                    : `Rematch — ${loser === 'P1' ? 'Silver' : 'Red'} moves first this time`
                }
                aria-label="Rematch, loser moves first"
                className="rounded-full bg-slate-700 p-2 hover:bg-slate-600 disabled:opacity-50"
              >
                <RestartIcon />
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
              >
                View board
              </button>
            </div>
            {seat !== null && (
              <p className="mt-3 text-xs text-slate-400">Leave the room to start a new game.</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A small restart/rematch wheel — a circular arrow. */
function RestartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}
