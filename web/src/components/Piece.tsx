import type { Player } from '../api/types'
import type { IdentifiedPiece } from '../game/board'

// Owner colours come from the piece tokens in index.css (@theme). `var()` in an SVG paint
// attribute resolves against the board's light squares — see the token comment there.
const FILL: Record<Player, string> = {
  P1: 'var(--color-piece-p1)',
  P2: 'var(--color-piece-p2)',
}
const STROKE: Record<Player, string> = {
  P1: 'var(--color-piece-p1-line)',
  P2: 'var(--color-piece-p2-line)',
}
const MIRROR = 'var(--color-mirror)'

// Depth is faked with two flat, id-free overlays layered on the body: a shifted dark
// underlay for a drop shadow and a translucent-white sliver for a lit facet. Both are
// owner-independent, need no <defs>/<filter>, and cost nothing to render 30+ times.
const SHADOW = '#000000'
const SHADOW_OPACITY = 0.18
const FACET = '#ffffff'
const FACET_OPACITY = 0.14

// One stroke weight for every silhouette outline; a lighter one for inner detail.
const SW = 4
const SW_DETAIL = 3

/**
 * Flat SVG in a 100x100 box, drawn in the NW orientation. The caller rotates the
 * wrapper (orientationDeg) so NW/NE/SE/SW fall out of a clockwise turn. Reflective
 * faces are drawn in --color-mirror so the reflection geometry reads at board scale.
 *
 * The rules-bearing geometry is fixed and must not move when the look is retuned:
 * Mirror's mirror is the SW->NE hypotenuse (facing NW); Swivel's plate is the "/"
 * diagonal; Heliostat's barrel and Sentinel's shielded bar are both on the LEFT edge in
 * this base orientation (Facing(NW) === 'Left').
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
    case 'Mirror':
      // Solid right-triangle in the SE half; the SW->NE hypotenuse is the mirror, facing NW.
      return (
        <g strokeLinejoin="round">
          <polygon points="18,90 90,90 90,18" fill={SHADOW} opacity={SHADOW_OPACITY} />
          <polygon points="14,86 86,86 86,14" fill={fill} stroke={stroke} strokeWidth={SW} />
          <polygon points="20,80 80,80 80,20" fill={FACET} opacity={FACET_OPACITY} />
          <line
            x1="14"
            y1="86"
            x2="86"
            y2="14"
            stroke={MIRROR}
            strokeWidth={9}
            strokeLinecap="round"
          />
          <line
            x1="14"
            y1="86"
            x2="86"
            y2="14"
            stroke={FACET}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.55}
          />
        </g>
      )
    case 'Swivel':
      // Double-sided diagonal mirror on the "/" diagonal; the body is a rounded square.
      return (
        <g strokeLinejoin="round">
          <rect
            x="26"
            y="26"
            width="56"
            height="56"
            rx="14"
            fill={SHADOW}
            opacity={SHADOW_OPACITY}
          />
          <rect
            x="22"
            y="22"
            width="56"
            height="56"
            rx="14"
            fill={fill}
            stroke={stroke}
            strokeWidth={SW}
          />
          {/* two-sided reflective plate, drawn as a thin parallelogram so both faces read */}
          <polygon
            points="24,72 30,78 78,30 72,24"
            fill={MIRROR}
            stroke={stroke}
            strokeWidth={SW_DETAIL - 1}
            strokeLinejoin="round"
          />
          <line
            x1="27"
            y1="75"
            x2="75"
            y2="27"
            stroke={FACET}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
        </g>
      )
    case 'Bastion': {
      const stacked = (piece.health ?? 1) >= 2
      // A blocking column with a capped top; the stacked (health >= 2) variant is a taller
      // tower with a seam across the middle where the two blocks meet.
      const bodyY = stacked ? 14 : 32
      const bodyH = stacked ? 72 : 52
      const capY = stacked ? 26 : 44
      return (
        <g strokeLinejoin="round">
          <rect
            x="32"
            y={bodyY + 3}
            width="44"
            height={bodyH}
            rx="7"
            fill={SHADOW}
            opacity={SHADOW_OPACITY}
          />
          <rect
            x="28"
            y={bodyY}
            width="44"
            height={bodyH}
            rx="7"
            fill={fill}
            stroke={stroke}
            strokeWidth={SW}
          />
          <line x1="28" y1={capY} x2="72" y2={capY} stroke={stroke} strokeWidth={SW_DETAIL} />
          {stacked && <line x1="28" y1="50" x2="72" y2="50" stroke={stroke} strokeWidth={SW} />}
          <rect
            x="33"
            y={bodyY + 5}
            width="7"
            height={bodyH - 12}
            rx="3"
            fill={FACET}
            opacity={FACET_OPACITY}
          />
        </g>
      )
    }
    case 'Keep':
      // The Keep, the target piece: a squat crenellated tower with an arched door. Wider than a
      // Bastion column and topped with battlements, so it never reads as a stacked Bastion.
      return (
        <g strokeLinejoin="round">
          <path
            d="M30 89V41H28V23H40V32H48V23H60V32H68V23H80V41H78V89Z"
            fill={SHADOW}
            opacity={SHADOW_OPACITY}
          />
          <path
            d="M26 86V38H24V20H36V29H44V20H56V29H64V20H76V38H74V86Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={SW}
          />
          <line x1="24" y1="38" x2="76" y2="38" stroke={stroke} strokeWidth={SW_DETAIL} />
          <path d="M40 86V70a8 8 0 0 1 16 0v16Z" fill={stroke} />
          <rect x="31" y="42" width="7" height="38" rx="3" fill={FACET} opacity={FACET_OPACITY} />
        </g>
      )
    case 'Heliostat':
      // Emitter housing with a barrel pointing LEFT in the NW base orientation
      // (Facing(NW) === 'Left'); the wrapper rotates it for NE/SE/SW.
      return (
        <g strokeLinejoin="round">
          <rect
            x="38"
            y="27"
            width="46"
            height="50"
            rx="10"
            fill={SHADOW}
            opacity={SHADOW_OPACITY}
          />
          <rect
            x="34"
            y="24"
            width="46"
            height="50"
            rx="10"
            fill={fill}
            stroke={stroke}
            strokeWidth={SW}
          />
          <rect x="8" y="40" width="30" height="18" rx="3" fill={fill} stroke={stroke} strokeWidth={SW} />
          <circle cx="14" cy="49" r="6.5" fill={MIRROR} stroke={stroke} strokeWidth={SW_DETAIL} />
          <rect x="39" y="29" width="8" height="40" rx="3" fill={FACET} opacity={FACET_OPACITY} />
        </g>
      )
    case 'Sentinel':
      // A blocking slab; the bright bar is its shielded front face, on the LEFT edge in the
      // NW base orientation (Facing(NW) === 'Left', the same map Heliostat uses). The wrapper
      // rotates it for NE/SE/SW. That bar is the face that absorbs and survives a hit — any
      // other side is fatal.
      return (
        <g strokeLinejoin="round">
          <rect
            x="26"
            y="26"
            width="56"
            height="56"
            rx="9"
            fill={SHADOW}
            opacity={SHADOW_OPACITY}
          />
          <rect
            x="22"
            y="22"
            width="56"
            height="56"
            rx="9"
            fill={fill}
            stroke={stroke}
            strokeWidth={SW}
          />
          <rect
            x="18"
            y="26"
            width="12"
            height="48"
            rx="4"
            fill={MIRROR}
            stroke={stroke}
            strokeWidth={SW_DETAIL}
          />
          <rect x="35" y="28" width="8" height="44" rx="3" fill={FACET} opacity={FACET_OPACITY} />
        </g>
      )
  }
}
