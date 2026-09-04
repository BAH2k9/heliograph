import { describe, expect, it } from 'vitest'
import {
  COLS,
  ROWS,
  edgePoint,
  inBounds,
  neighbours,
  orientationDeg,
  rotate,
  sphinxFacings,
  toggleSphinx,
} from './coords'

describe('rotate — matches GameEngine.Rotate', () => {
  it('CW cycles NW -> NE -> SE -> SW -> NW', () => {
    expect(rotate('NW', 'CW')).toBe('NE')
    expect(rotate('NE', 'CW')).toBe('SE')
    expect(rotate('SE', 'CW')).toBe('SW')
    expect(rotate('SW', 'CW')).toBe('NW')
  })

  it('CCW cycles NW -> SW -> SE -> NE -> NW', () => {
    expect(rotate('NW', 'CCW')).toBe('SW')
    expect(rotate('SW', 'CCW')).toBe('SE')
    expect(rotate('SE', 'CCW')).toBe('NE')
    expect(rotate('NE', 'CCW')).toBe('NW')
  })

  it('four CW steps return to the start', () => {
    let o = rotate('NE', 'CW')
    o = rotate(o, 'CW')
    o = rotate(o, 'CW')
    o = rotate(o, 'CW')
    expect(o).toBe('NE')
  })
})

describe('sphinxFacings / toggleSphinx — matches GameEngine.SphinxFacings', () => {
  it('gives the two board-facing orientations per corner', () => {
    expect(sphinxFacings({ row: 7, col: 9 })).toEqual(['NE', 'NW'])
    expect(sphinxFacings({ row: 0, col: 0 })).toEqual(['SW', 'SE'])
    expect(sphinxFacings({ row: 3, col: 3 })).toBeNull()
  })

  it('toggles between the pair regardless of the rotate direction', () => {
    expect(toggleSphinx({ row: 7, col: 9 }, 'NE')).toBe('NW')
    expect(toggleSphinx({ row: 7, col: 9 }, 'NW')).toBe('NE')
    expect(toggleSphinx({ row: 0, col: 0 }, 'SW')).toBe('SE')
    expect(toggleSphinx({ row: 0, col: 0 }, 'SE')).toBe('SW')
  })
})

describe('orientationDeg', () => {
  it('is a clockwise quarter-turn per step from NW', () => {
    expect(orientationDeg('NW')).toBe(0)
    expect(orientationDeg('NE')).toBe(90)
    expect(orientationDeg('SE')).toBe(180)
    expect(orientationDeg('SW')).toBe(270)
  })
})

describe('inBounds / neighbours', () => {
  it('accepts the 8x10 grid and rejects outside it', () => {
    expect(inBounds({ row: 0, col: 0 })).toBe(true)
    expect(inBounds({ row: ROWS - 1, col: COLS - 1 })).toBe(true)
    expect(inBounds({ row: -1, col: 0 })).toBe(false)
    expect(inBounds({ row: 0, col: COLS })).toBe(false)
  })

  it('gives 8 neighbours in the middle, 3 in a corner', () => {
    expect(neighbours({ row: 4, col: 4 })).toHaveLength(8)
    expect(neighbours({ row: 0, col: 0 })).toHaveLength(3)
  })
})

describe('edgePoint', () => {
  it('returns the midpoint of the named edge in cell units', () => {
    const c = { row: 2, col: 3 }
    expect(edgePoint(c, 'Top', 1)).toEqual({ x: 3.5, y: 2 })
    expect(edgePoint(c, 'Bottom', 1)).toEqual({ x: 3.5, y: 3 })
    expect(edgePoint(c, 'Left', 1)).toEqual({ x: 3, y: 2.5 })
    expect(edgePoint(c, 'Right', 1)).toEqual({ x: 4, y: 2.5 })
  })
})
