import { motion } from 'framer-motion'
import { cn } from '../ui/cn'
import { useGame } from '../store'

/**
 * Sits in the same top-right slot `ResignButton` occupies once it renders nothing (game over),
 * sized to match it. Appears only after `WinOverlay` has been dismissed — see `overlayDismissed`
 * on `GameStore` — so a click-away doesn't leave the board with no way to start a rematch without
 * reopening the dialog. Still seated in a multiplayer room (P1/P2, not a spectator)? `playAgain`
 * requests a rematch with the same opponent instead of starting an unrelated game — see
 * `GameStore.requestRematch`'s doc comment for the propose/match shape (no separate accept step:
 * the other seat's own click, here or on `RematchOfferBanner`, is what completes it). Shows a
 * "Waiting…" state while `rematchRequestedByMe` — the click already landed, nothing more to do
 * but wait on the other seat (or the match, which auto-enters the new room either way).
 *
 * Solid accent + a spring pop-in and a slow breathing glow (paused while disabled) mark it as the
 * one live thing left on an otherwise finished board — deliberately louder than `ResignButton`'s
 * quiet outline, since this is the button most players actually want to hit next.
 */
export function PlayAgainButton({ className }: { className?: string }) {
  const status = useGame((s) => s.status)
  const overlayDismissed = useGame((s) => s.overlayDismissed)
  const busy = useGame((s) => s.busy)
  const rematchRequestedByMe = useGame((s) => s.rematchRequestedByMe)
  const playAgain = useGame((s) => s.playAgain)

  const won = status === 'P1Win' || status === 'P2Win'
  if (!won || !overlayDismissed) return null

  const disabled = busy || rematchRequestedByMe

  return (
    <motion.button
      type="button"
      onClick={playAgain}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-accent-fg',
        'bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
      animate={{
        opacity: 1,
        scale: 1,
        rotate: 0,
        boxShadow: disabled
          ? '0 0 0 0 rgba(91,99,196,0)'
          : ['0 0 0 0 rgba(91,99,196,0)', '0 0 0 6px rgba(91,99,196,0.45)', '0 0 0 0 rgba(91,99,196,0)'],
      }}
      transition={{
        default: { type: 'spring', stiffness: 500, damping: 18 },
        boxShadow: { duration: 1.6, repeat: disabled ? 0 : Infinity, repeatDelay: 1.4, ease: 'easeOut' },
      }}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        whileHover={disabled ? undefined : { rotate: 180 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
      >
        <path d="M3 12a9 9 0 1 1 2.64 6.36" />
        <path d="M3 20v-6h6" />
      </motion.svg>
      {rematchRequestedByMe ? 'Waiting…' : 'Play again'}
    </motion.button>
  )
}
