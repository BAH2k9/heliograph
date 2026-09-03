import type { LaserSegment } from '../api/types'
import { COLS, ROWS, edgePoint, squareCentre } from '../game/coords'
import { useGame } from '../store'

/** Draws the last fired beam as one polyline through each square's centre and its crossed edges. */
export function LaserLayer() {
  const laser = useGame((s) => s.lastLaser)
  if (!laser || laser.length === 0) return null

  const points = beamPoints(laser)
    .map((p) => `${p.x},${p.y}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="h-full w-full">
      <polyline
        points={points}
        fill="none"
        stroke="#f87171"
        strokeOpacity={0.9}
        strokeWidth={0.07}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function beamPoints(segments: LaserSegment[]): { x: number; y: number }[] {
  const cell = 1
  const points: { x: number; y: number }[] = []
  segments.forEach((s, i) => {
    if (i === 0) points.push(edgePoint(s, s.enter, cell))
    points.push(squareCentre(s, cell))
    if (s.exit) points.push(edgePoint(s, s.exit, cell))
  })
  return points
}
