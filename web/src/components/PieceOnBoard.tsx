import { motion } from 'framer-motion'
import type { IdentifiedPiece } from '../game/board'
import { COLS, ROWS, orientationDeg } from '../game/coords'
import { useDisplaySettings } from '../settings/displaySettings'
import { Piece } from './Piece'

/**
 * One piece on the board — an absolutely-positioned cell that slides/rotates to its
 * square, or plays a quick pop-and-vanish when the laser destroys it.
 *
 * `will-change-transform` gives every piece its own GPU layer up front. Framer Motion writes
 * `transform`/`opacity` from `requestAnimationFrame` rather than handing the browser a compositor
 * animation, so an unpromoted piece makes each frame repaint the board underneath it. On a weak
 * phone that dropped slides to ~2 fps (`docs/bugs/phone-animation-jank.md`). A promoted piece
 * just moves a texture that's already painted. `PieceOnBoard.test.tsx` guards it.
 */
export function PieceOnBoard({ piece, dying }: { piece: IdentifiedPiece; dying: boolean }) {
  const { moveMs, deathMs } = useDisplaySettings((s) => s.animation)
  const deg = piece.orientation ? orientationDeg(piece.orientation) : 0
  const x = `${piece.col * 100}%`
  const y = `${piece.row * 100}%`

  return (
    <motion.div
      className="absolute left-0 top-0 will-change-transform"
      style={{ width: `${100 / COLS}%`, height: `${100 / ROWS}%` }}
      initial={false}
      animate={
        dying
          ? { x, y, rotate: deg, scale: [1, 1.25, 0], opacity: [1, 1, 0] }
          : { x, y, rotate: deg, scale: 1, opacity: 1 }
      }
      transition={
        dying
          ? { duration: deathMs / 1000, ease: 'easeIn', times: [0, 0.35, 1] }
          : { duration: moveMs / 1000, ease: 'easeInOut' }
      }
    >
      <div className="flex h-full w-full items-center justify-center p-[10%]">
        <Piece piece={piece} />
      </div>
    </motion.div>
  )
}
