import type { Player } from '../api/types'
import type { IdentifiedPiece } from '../game/board'

const FILL: Record<Player, string> = { P1: '#cbd5e1', P2: '#ef4444' }
const STROKE: Record<Player, string> = { P1: '#475569', P2: '#7f1d1d' }
const MIRROR = '#bae6fd'

/**
 * Flat SVG in a 100x100 box, drawn in the NW orientation. The caller rotates the
 * wrapper (orientationDeg) so NW/NE/SE/SW fall out of a clockwise turn. Mirror faces
 * are drawn bright so the reflection geometry reads.
 */
export function Piece({ piece }: { piece: IdentifiedPiece }) {
  const fill = FILL[piece.owner]
  const stroke = STROKE[piece.owner]

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
      {shape(piece, fill, stroke)}
    </svg>
  )
}

function shape(piece: IdentifiedPiece, fill: string, stroke: string) {
  switch (piece.kind) {
    case 'Pyramid':
      // Solid right-triangle in the SE half; the SW->NE hypotenuse is the mirror, facing NW.
      return (
        <g strokeLinejoin="round">
          <polygon points="14,86 86,86 86,14" fill={fill} stroke={stroke} strokeWidth={5} />
          <line x1="14" y1="86" x2="86" y2="14" stroke={MIRROR} strokeWidth={8} strokeLinecap="round" />
        </g>
      )
    case 'Djed':
      // Double-sided diagonal mirror.
      return (
        <g strokeLinejoin="round">
          <rect x="22" y="22" width="56" height="56" rx="12" fill={fill} stroke={stroke} strokeWidth={5} />
          <line x1="26" y1="74" x2="74" y2="26" stroke={MIRROR} strokeWidth={10} strokeLinecap="round" />
        </g>
      )
    case 'Obelisk': {
      const stacked = (piece.health ?? 1) >= 2
      return (
        <g strokeLinejoin="round">
          <rect
            x="28"
            y={stacked ? 18 : 34}
            width="44"
            height={stacked ? 64 : 48}
            rx="8"
            fill={fill}
            stroke={stroke}
            strokeWidth={5}
          />
          {stacked && <line x1="28" y1="50" x2="72" y2="50" stroke={stroke} strokeWidth={4} />}
        </g>
      )
    }
    case 'Pharaoh':
      return (
        <g strokeLinejoin="round">
          <polygon points="50,8 62,30 38,30" fill={fill} stroke={stroke} strokeWidth={5} />
          <circle cx="50" cy="56" r="30" fill={fill} stroke={stroke} strokeWidth={5} />
          <circle cx="50" cy="56" r="13" fill="none" stroke={stroke} strokeWidth={5} />
        </g>
      )
  }
}
