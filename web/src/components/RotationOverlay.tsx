import type { Coord, RotationDir } from '../api/types'
import { COLS, ROWS } from '../game/coords'

// Geometry, in a 100x100 box centred on the piece. Angles: 0 = straight up, clockwise positive.
const CENTRE = 50
const RADIUS = 43
const HEAD_LEN = 9
const HEAD_SPREAD_DEG = 32
// CW arc sweeps 30° -> 60° (upper right); CCW is its mirror, -30° -> -60° (upper left).
const CW_FROM = 30
const CW_TO = 60

/**
 * A short curved-arrow segment in each upper corner of the selected piece's square —
 * counter-clockwise upper-left, clockwise upper-right — sitting just outside the piece.
 * See-through at rest, solid on hover. The layer is click-through; only the arrows catch
 * pointer events. Q / E do the same. On a touch screen the arrows are too small to tap reliably,
 * so PlayScreen adds full-size `RotateButtons` below the board there.
 */
export function RotationOverlay({
  at,
  onRotate,
  disabled,
  single,
}: {
  at: Coord
  onRotate: (dir: RotationDir) => void
  disabled: boolean
  /**
   * The Heliostat has only two facings and a rotate always toggles to the other one — CW and CCW
   * are the same action, so showing both arrows implies a choice that doesn't exist. When true,
   * render just the one arrow (still emits 'CW'; the server ignores direction for the Heliostat).
   */
  single?: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width: `${100 / COLS}%`,
        height: `${100 / ROWS}%`,
        transform: `translate(${at.col * 100}%, ${at.row * 100}%)`,
      }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
        {!single && <ArcArrow dir="CCW" disabled={disabled} onClick={() => onRotate('CCW')} />}
        <ArcArrow dir="CW" disabled={disabled} single={single} onClick={() => onRotate('CW')} />
      </svg>
    </div>
  )
}

function ArcArrow({
  dir,
  disabled,
  single,
  onClick,
}: {
  dir: RotationDir
  disabled: boolean
  single?: boolean
  onClick: () => void
}) {
  const [from, to] = dir === 'CW' ? [CW_FROM, CW_TO] : [-CW_FROM, -CW_TO]
  const { arc, head } = arcArrow(CENTRE, CENTRE, RADIUS, from, to)
  const label = single ? 'Flip the Heliostat (Q or E)' : dir === 'CW' ? 'Rotate clockwise (E)' : 'Rotate counter-clockwise (Q)'
  const glow = { filter: 'drop-shadow(0 0 1.5px rgba(255,255,255,0.9))' }

  return (
    <g
      role="button"
      aria-label={label}
      onClick={disabled ? undefined : onClick}
      className={
        disabled
          ? 'opacity-30'
          : 'pointer-events-auto cursor-pointer text-board-ink/45 transition-colors hover:text-board-ink'
      }
    >
      {/* hover tooltip — the only place a mouse user is told about Q / E */}
      <title>{label}</title>
      {/* generous transparent hit target along the arc */}
      <path d={arc} fill="none" stroke="transparent" strokeWidth={24} strokeLinecap="round" />
      <path
        d={arc}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        style={glow}
      />
      <path
        d={head}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={glow}
      />
    </g>
  )
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
}

function n(v: number): string {
  return v.toFixed(2)
}

/** Path strings for a short arc from `fromDeg` to `toDeg` with an arrowhead at the `toDeg` end. */
function arcArrow(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const start = polar(cx, cy, r, fromDeg)
  const end = polar(cx, cy, r, toDeg)
  const clockwise = toDeg > fromDeg
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  const sweep = clockwise ? 1 : 0
  const arc = `M ${n(start.x)} ${n(start.y)} A ${r} ${r} 0 ${largeArc} ${sweep} ${n(end.x)} ${n(end.y)}`

  // Tangent at the end, pointing the way the beam of rotation travels.
  const ta = (toDeg * Math.PI) / 180
  let tx = Math.cos(ta)
  let ty = Math.sin(ta)
  if (!clockwise) {
    tx = -tx
    ty = -ty
  }
  const back = Math.atan2(-ty, -tx)
  const s = (HEAD_SPREAD_DEG * Math.PI) / 180
  const w1 = { x: end.x + HEAD_LEN * Math.cos(back + s), y: end.y + HEAD_LEN * Math.sin(back + s) }
  const w2 = { x: end.x + HEAD_LEN * Math.cos(back - s), y: end.y + HEAD_LEN * Math.sin(back - s) }
  const head = `M ${n(w1.x)} ${n(w1.y)} L ${n(end.x)} ${n(end.y)} L ${n(w2.x)} ${n(w2.y)}`

  return { arc, head }
}
