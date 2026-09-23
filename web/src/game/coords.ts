import type { Coord, LaserEdge, Orientation, RotationDir } from '../api/types'

export const ROWS = 8
export const COLS = 10

export function inBounds(c: Coord): boolean {
  return c.row >= 0 && c.row < ROWS && c.col >= 0 && c.col < COLS
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col
}

export function coordKey(c: Coord): string {
  return `${c.row},${c.col}`
}

/** The 8 squares around `c` that are on the board. */
export function neighbours(c: Coord): Coord[] {
  const out: Coord[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const n = { row: c.row + dr, col: c.col + dc }
      if (inBounds(n)) out.push(n)
    }
  }
  return out
}

/** Top-left pixel of a square, given the square size in px. */
export function squareTopLeft(c: Coord, cell: number): { x: number; y: number } {
  return { x: c.col * cell, y: c.row * cell }
}

/** Centre pixel of a square. */
export function squareCentre(c: Coord, cell: number): { x: number; y: number } {
  return { x: (c.col + 0.5) * cell, y: (c.row + 0.5) * cell }
}

/** Point on a square's border where a laser crosses the given edge. */
export function edgePoint(c: Coord, edge: LaserEdge, cell: number): { x: number; y: number } {
  const left = c.col * cell
  const top = c.row * cell
  switch (edge) {
    case 'Top':
      return { x: left + cell / 2, y: top }
    case 'Bottom':
      return { x: left + cell / 2, y: top + cell }
    case 'Left':
      return { x: left, y: top + cell / 2 }
    case 'Right':
      return { x: left + cell, y: top + cell / 2 }
  }
}

// Base SVGs are drawn in the NW orientation; each clockwise step adds 90 degrees.
const ORIENTATION_DEG: Record<Orientation, number> = { NW: 0, NE: 90, SE: 180, SW: 270 }

export function orientationDeg(o: Orientation): number {
  return ORIENTATION_DEG[o]
}

// Matches GameEngine.Rotate: CW is NW->NE->SE->SW->NW.
const CW_NEXT: Record<Orientation, Orientation> = { NW: 'NE', NE: 'SE', SE: 'SW', SW: 'NW' }
const CCW_NEXT: Record<Orientation, Orientation> = { NW: 'SW', SW: 'SE', SE: 'NE', NE: 'NW' }

export function rotate(o: Orientation, dir: RotationDir): Orientation {
  return dir === 'CW' ? CW_NEXT[o] : CCW_NEXT[o]
}

/**
 * The two orientations a Sphinx on the given corner square may face (Turning Sun). A rotate
 * toggles between them regardless of direction. Mirrors GameEngine.SphinxFacings — the two
 * corners are the fixed emitter squares (7,9) for P1 and (0,0) for P2.
 */
export function sphinxFacings(c: Coord): readonly [Orientation, Orientation] | null {
  if (c.row === 7 && c.col === 9) return ['NE', 'NW'] // up column 9 / left along row 7
  if (c.row === 0 && c.col === 0) return ['SW', 'SE'] // down column 0 / right along row 0
  return null
}

/** The next orientation for a Sphinx rotate: toggles to the other facing for its square. */
export function toggleSphinx(c: Coord, current: Orientation): Orientation {
  const pair = sphinxFacings(c)
  if (!pair) return current
  return current === pair[0] ? pair[1] : pair[0]
}
