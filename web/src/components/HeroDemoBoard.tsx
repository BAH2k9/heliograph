import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { IdentifiedPiece } from '../game/board'
import { orientationDeg } from '../game/coords'
import { beamDurationMs, pathLength, type Point } from '../game/laser'
import { DEFAULT_DISPLAY_SETTINGS } from '../settings/displaySettings'
import { Piece } from './Piece'

// A small square slice of the board — just the four corners a laser needs to bounce
// around forever. Independent of the real game's ROWS/COLS; this is pure decoration.
const SIZE = 6

const CORNERS = {
  bl: { row: SIZE - 1, col: 0 },
  br: { row: SIZE - 1, col: SIZE - 1 },
  tr: { row: 0, col: SIZE - 1 },
  tl: { row: 0, col: 0 },
} as const

function center(c: { row: number; col: number }): Point {
  return { x: c.col + 0.5, y: c.row + 0.5 }
}

// The closed loop the beam travels: corner to corner and back to the start.
const LOOP: Point[] = [
  center(CORNERS.bl),
  center(CORNERS.br),
  center(CORNERS.tr),
  center(CORNERS.tl),
  center(CORNERS.bl),
]

const LASER = DEFAULT_DISPLAY_SETTINGS.laser
const LOOP_LENGTH = pathLength(LOOP)
// One full lap, plus the extra sliver the dash pattern needs to land back exactly where
// it started — without it the repeating animation has a visible seam each time it wraps.
const LOOP_PERIOD_MS = beamDurationMs(LOOP, LASER) + (LASER.bulletLength / LASER.speed) * 1000

function corner(
  id: string,
  at: { row: number; col: number },
  kind: 'Sphinx' | 'Djed',
  owner: 'P1' | 'P2',
  orientation: 'NW' | 'NE' | 'SE' | 'SW',
): IdentifiedPiece {
  return { id, row: at.row, col: at.col, kind, owner, orientation, health: null }
}

/**
 * The emitting corner starts as a Sphinx and permanently turns into a Djed once the
 * beam completes its first lap — every corner is a Djed after that, and the beam just
 * keeps circling. Orientations are picked so each mirror's diagonal plausibly matches
 * the bend the (hardcoded) `LOOP` path makes there; the path itself doesn't simulate
 * reflection, it's simply drawn.
 */
function buildPieces(swapped: boolean): IdentifiedPiece[] {
  return [
    corner('demo-corner-bl', CORNERS.bl, swapped ? 'Djed' : 'Sphinx', 'P1', swapped ? 'SW' : 'SE'),
    corner('demo-corner-br', CORNERS.br, 'Djed', 'P2', 'NW'),
    corner('demo-corner-tr', CORNERS.tr, 'Djed', 'P1', 'NE'),
    corner('demo-corner-tl', CORNERS.tl, 'Djed', 'P2', 'NW'),
  ]
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * A decorative, store-free demo board for the landing hero: a laser bounces off a Djed
 * in each corner, endlessly circling the board. The starting corner is a Sphinx that
 * turns into a Djed after its first lap. No game engine, no network.
 */
export function HeroDemoBoard() {
  const [reducedMotion] = useState(prefersReducedMotion)
  const [swapped, setSwapped] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion || swapped) return
    const timer = setTimeout(() => setSwapped(true), LOOP_PERIOD_MS)
    return () => clearTimeout(timer)
  }, [reducedMotion, swapped])

  const pieces = buildPieces(swapped)

  return (
    <div
      className="relative mx-auto select-none rounded-lg bg-slate-800 p-[1.2%] shadow-2xl ring-1 ring-white/10"
      style={{ width: 'min(80vw, 520px)', aspectRatio: '1 / 1' }}
    >
      <div
        className="grid h-full w-full overflow-hidden rounded"
        style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}
      >
        {Array.from({ length: SIZE * SIZE }, (_, i) => (
          <div key={i} className="border border-slate-700/40 bg-slate-100/90" />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-[1.2%]">
        <div className="relative h-full w-full">
          {pieces.map((p) => (
            <div
              key={p.id}
              className="absolute left-0 top-0"
              style={{
                width: `${100 / SIZE}%`,
                height: `${100 / SIZE}%`,
                left: `${(p.col / SIZE) * 100}%`,
                top: `${(p.row / SIZE) * 100}%`,
                transform: p.orientation ? `rotate(${orientationDeg(p.orientation)}deg)` : undefined,
              }}
            >
              <div className="flex h-full w-full items-center justify-center p-[10%]">
                <Piece piece={p} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!reducedMotion && (
        <div className="pointer-events-none absolute inset-[1.2%]">
          <LoopBeam />
        </div>
      )}
    </div>
  )
}

function LoopBeam() {
  const line = LOOP.map((p) => `${p.x},${p.y}`).join(' ')
  // Sweep exactly one dash-pattern period so the repeat's reset is invisible.
  const travel = LOOP_LENGTH + 2 * LASER.bulletLength

  const flight = {
    points: line,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeDasharray: `${LASER.bulletLength} ${LOOP_LENGTH + LASER.bulletLength}`,
    animate: { strokeDashoffset: [LASER.bulletLength, LASER.bulletLength - travel] },
    transition: { duration: LOOP_PERIOD_MS / 1000, ease: 'linear' as const, repeat: Infinity },
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full overflow-visible">
      <motion.polyline
        stroke={LASER.glowColor}
        strokeOpacity={LASER.glowOpacity}
        strokeWidth={LASER.glowWidth}
        {...flight}
      />
      <motion.polyline stroke={LASER.coreColor} strokeWidth={LASER.coreWidth} {...flight} />
    </svg>
  )
}
