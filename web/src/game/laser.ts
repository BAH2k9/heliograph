import type { LaserSegment } from '../api/types'
import { edgePoint, squareCentre } from './coords'

export interface Point {
  x: number
  y: number
}

/** Ordered points for the beam polyline, in cell units (1 unit = 1 square side). */
export function beamPoints(segments: LaserSegment[]): Point[] {
  const cell = 1
  const points: Point[] = []
  segments.forEach((s, i) => {
    if (i === 0) points.push(edgePoint(s, s.enter, cell))
    points.push(squareCentre(s, cell))
    if (s.exit) points.push(edgePoint(s, s.exit, cell))
  })
  return points
}

/** Total length of the polyline through `points`, i.e. what SVG getTotalLength() would return. */
export function pathLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return total
}

/**
 * How long the bullet takes to travel the whole path, plus its own length so it fully exits.
 * `speed` is in squares/sec and `bulletLength` in squares — both come from the laser settings.
 */
export function beamDurationMs(
  points: Point[],
  opts: { speed: number; bulletLength: number },
): number {
  return ((pathLength(points) + opts.bulletLength) / opts.speed) * 1000
}
