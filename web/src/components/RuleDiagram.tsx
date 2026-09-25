import type { ReactNode } from 'react'
import type { BoardPiece } from '../api/types'
import { orientationDeg } from '../game/coords'
import type { Point } from '../game/laser'
import { DEFAULT_DISPLAY_SETTINGS } from '../settings/displaySettings'
import { Piece } from './Piece'

const LASER = DEFAULT_DISPLAY_SETTINGS.laser

export type DiagramPiece = Pick<BoardPiece, 'row' | 'col' | 'kind' | 'owner' | 'orientation'> & {
  health?: number
  /** Drawn faded: the beam destroyed it. */
  destroyed?: boolean
}

/**
 * A still slice of board for the How to play page: a few squares, a piece or two, and a beam's
 * whole path drawn at once. Store-free and pure decoration, like `HeroDemoBoard` — nothing here
 * is checked against the rules, so each caller's beam has to be traced by hand (against
 * `Heliograph.Engine/LaserReflection.cs`) when it's written.
 *
 * `beam` is in square units with (0,0) at the slice's top-left corner, the same space
 * `LaserLayer` draws in. The beam is drawn *under* the pieces, so a path ending on a piece's
 * centre reads as stopping at whichever face it struck.
 */
export function RuleDiagram({
  rows = 3,
  cols = 3,
  pieces,
  beam,
  caption,
}: {
  rows?: number
  cols?: number
  pieces: DiagramPiece[]
  beam: Point[]
  caption: ReactNode
}) {
  const points = beam.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        aria-hidden
        className="relative w-full max-w-36 select-none rounded-md bg-board-frame p-[3%] ring-1 ring-border"
        style={{ aspectRatio: `${cols} / ${rows}` }}
      >
        <div
          className="grid h-full w-full overflow-hidden rounded-sm"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {Array.from({ length: rows * cols }, (_, i) => (
            <div key={i} className="border border-square-line/40 bg-square" />
          ))}
        </div>

        <div className="absolute inset-[3%]">
          <svg viewBox={`0 0 ${cols} ${rows}`} className="absolute inset-0 h-full w-full overflow-visible">
            <polyline
              points={points}
              fill="none"
              stroke={LASER.glowColor}
              strokeOpacity={LASER.glowOpacity}
              strokeWidth={LASER.glowWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={points}
              fill="none"
              stroke={LASER.coreColor}
              strokeWidth={LASER.coreWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {pieces.map((p) => (
            <div
              key={`${p.row},${p.col}`}
              className="absolute"
              style={{
                width: `${100 / cols}%`,
                height: `${100 / rows}%`,
                left: `${(p.col / cols) * 100}%`,
                top: `${(p.row / rows) * 100}%`,
                transform: p.orientation ? `rotate(${orientationDeg(p.orientation)}deg)` : undefined,
                opacity: p.destroyed ? 0.3 : 1,
              }}
            >
              <div className="h-full w-full p-[10%]">
                <Piece piece={{ ...p, id: `${p.row},${p.col}`, health: p.health ?? null }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="max-w-40 text-center text-xs leading-snug text-text-muted">{caption}</figcaption>
    </figure>
  )
}
