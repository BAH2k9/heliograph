import { motion } from 'framer-motion'
import type { Player } from '../api/types'
import { COLS, ROWS } from '../game/coords'
import { useDisplaySettings } from '../settings/displaySettings'

/**
 * Plays once, centred on the square the losing Keep just fell on — an expanding ring plus a
 * board-wide colour wash in the winner's colour, held for `animation.pharaohDeathMs`. Meant to
 * read as the moment the game actually ended, distinct from an ordinary piece's pop-and-vanish
 * (`PieceOnBoard`) — so it lives here, not there, and never plays during a replay's own piece
 * animations (`ReplayBoard` doesn't render it).
 */
export function PharaohDownEffect({
  at,
}: {
  at: { row: number; col: number; owner: Player }
}) {
  const { pharaohDeathMs } = useDisplaySettings((s) => s.animation)
  const seconds = pharaohDeathMs / 1000
  const winnerColor = at.owner === 'P1' ? 'var(--color-piece-p2)' : 'var(--color-piece-p1)'
  const x = `${((at.col + 0.5) / COLS) * 100}%`
  const y = `${((at.row + 0.5) / ROWS) * 100}%`

  return (
    <>
      {/* board-wide flash, fading out over the whole beat */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: winnerColor }}
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 0 }}
        transition={{ duration: seconds, ease: 'easeOut' }}
      />
      {/* shockwave ring expanding from the fallen Keep's square */}
      <motion.div
        className="pointer-events-none absolute rounded-full border-4"
        style={{ left: x, top: y, borderColor: winnerColor, translateX: '-50%', translateY: '-50%' }}
        initial={{ width: 0, height: 0, opacity: 0.9 }}
        animate={{ width: '220%', height: '220%', opacity: 0 }}
        transition={{ duration: seconds, ease: 'easeOut' }}
      />
    </>
  )
}
