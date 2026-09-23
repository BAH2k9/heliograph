import { describe, expect, it } from 'vitest'
import type { BoardState, Player } from '../api/types'
import { identify, type ClientBoard } from './board'
import { coordKey } from './coords'
import {
  EMITTER,
  canRotate,
  legalDestinations,
  legalStackTargets,
  heliostatFacings,
  squareOwner,
  unstackTargets,
} from './rules'

function board(pieces: BoardState['pieces']): ClientBoard {
  return identify({ rows: 8, cols: 10, pieces })
}

function keys(cs: { row: number; col: number }[]): Set<string> {
  return new Set(cs.map(coordKey))
}

// Parity with GameEngine.SquareOwner in Heliograph.Engine/GameEngine.cs.
describe('squareOwner', () => {
  it.each<[number, number, Player | null]>([
    [0, 9, 'P1'],
    [4, 9, 'P1'],
    [0, 1, 'P1'],
    [7, 1, 'P1'],
    [0, 0, 'P2'],
    [4, 0, 'P2'],
    [0, 8, 'P2'],
    [7, 8, 'P2'],
    [4, 4, null],
    [0, 2, null],
    [7, 7, null],
  ])('(%i,%i) -> %s', (row, col, owner) => {
    expect(squareOwner({ row, col })).toBe(owner)
  })
})

describe('emitters', () => {
  it('sit at the two corners the engine fires from', () => {
    expect(EMITTER.P1).toEqual({ row: 7, col: 9 })
    expect(EMITTER.P2).toEqual({ row: 0, col: 0 })
  })
})

describe('canRotate', () => {
  it('is true for mirrors, swivels, the heliostat and the sentinel', () => {
    expect(canRotate({ id: 'a', row: 0, col: 0, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null })).toBe(true)
    expect(canRotate({ id: 'b', row: 0, col: 0, kind: 'Swivel', owner: 'P1', orientation: 'NE', health: null })).toBe(true)
    expect(canRotate({ id: 'e', row: 7, col: 9, kind: 'Heliostat', owner: 'P1', orientation: 'NE', health: null })).toBe(true)
    expect(canRotate({ id: 'f', row: 0, col: 0, kind: 'Sentinel', owner: 'P1', orientation: 'NW', health: null })).toBe(true)
    expect(canRotate({ id: 'c', row: 0, col: 0, kind: 'Bastion', owner: 'P1', orientation: null, health: 2 })).toBe(false)
    expect(canRotate({ id: 'd', row: 0, col: 0, kind: 'Keep', owner: 'P1', orientation: null, health: null })).toBe(false)
  })
})

// Parity with GameEngine.HeliostatFacings.
describe('heliostatFacings', () => {
  it('gives P1 corner NE/NW and P2 corner SW/SE, null elsewhere', () => {
    expect(heliostatFacings({ row: 7, col: 9 })).toEqual(['NE', 'NW'])
    expect(heliostatFacings({ row: 0, col: 0 })).toEqual(['SW', 'SE'])
    expect(heliostatFacings({ row: 4, col: 4 })).toBeNull()
  })
})

describe('legalDestinations — parity with GameEngine.ValidateMove (Move branch)', () => {
  it('is empty when the square is empty or the piece is not the mover’s', () => {
    const b = board([{ row: 4, col: 4, kind: 'Mirror', owner: 'P2', orientation: 'NE', health: null }])
    expect(legalDestinations(b, { row: 4, col: 4 }, 'P1')).toEqual([])
    expect(legalDestinations(b, { row: 0, col: 0 }, 'P2')).toEqual([])
  })

  it('offers all 8 adjacent empty neutral squares', () => {
    const b = board([{ row: 4, col: 4, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null }])
    expect(legalDestinations(b, { row: 4, col: 4 }, 'P1')).toHaveLength(8)
  })

  it('excludes the opponent’s restricted squares but allows the mover’s own', () => {
    const b = board([{ row: 1, col: 1, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null }])
    const dest = keys(legalDestinations(b, { row: 1, col: 1 }, 'P1'))
    expect(dest.has(coordKey({ row: 0, col: 0 }))).toBe(false) // P2 column
    expect(dest.has(coordKey({ row: 2, col: 0 }))).toBe(false)
    expect(dest.has(coordKey({ row: 0, col: 1 }))).toBe(true) // P1 restricted, own
    expect(dest.has(coordKey({ row: 1, col: 2 }))).toBe(true) // neutral
  })

  it('never offers the laser emitter square', () => {
    const b = board([{ row: 6, col: 9, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null }])
    const dest = keys(legalDestinations(b, { row: 6, col: 9 }, 'P1'))
    expect(dest.has(coordKey(EMITTER.P1))).toBe(false)
  })

  it('is empty for a heliostat — it never moves', () => {
    const b = board([{ row: 7, col: 9, kind: 'Heliostat', owner: 'P1', orientation: 'NE', health: null }])
    expect(legalDestinations(b, { row: 7, col: 9 }, 'P1')).toEqual([])
  })

  it('blocks an occupied square for a non-Swivel but allows a Swivel swap with a mirror or bastion', () => {
    const withPyr = board([
      { row: 4, col: 4, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Mirror', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(withPyr, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(false)

    const swivelVsPyr = board([
      { row: 4, col: 4, kind: 'Swivel', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Mirror', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(swivelVsPyr, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(true)

    const swivelVsSwivel = board([
      { row: 4, col: 4, kind: 'Swivel', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Swivel', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(swivelVsSwivel, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(false)

    const swivelVsSentinel = board([
      { row: 4, col: 4, kind: 'Swivel', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Sentinel', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(swivelVsSentinel, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(true)
  })
})

// Parity with GameEngine.ValidateStack / ValidateUnstack.
describe('legalStackTargets', () => {
  it('offers an adjacent owned single bastion as a stack target', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Bastion', owner: 'P1', orientation: null, health: 1 },
      { row: 4, col: 5, kind: 'Bastion', owner: 'P1', orientation: null, health: 1 },
    ])
    expect(keys(legalStackTargets(b, { row: 4, col: 4 }, 'P1'))).toEqual(keys([{ row: 4, col: 5 }]))
  })

  it('excludes an enemy bastion, a non-bastion, and an already-stacked target', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Bastion', owner: 'P1', orientation: null, health: 1 },
      { row: 4, col: 5, kind: 'Bastion', owner: 'P2', orientation: null, health: 1 },
      { row: 3, col: 4, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null },
      { row: 5, col: 4, kind: 'Bastion', owner: 'P1', orientation: null, health: 2 },
    ])
    expect(legalStackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })

  it('is empty when the selected bastion is already two-high', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Bastion', owner: 'P1', orientation: null, health: 2 },
      { row: 4, col: 5, kind: 'Bastion', owner: 'P1', orientation: null, health: 1 },
    ])
    expect(legalStackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })

  it('is empty for a non-bastion', () => {
    const b = board([{ row: 4, col: 4, kind: 'Mirror', owner: 'P1', orientation: 'NE', health: null }])
    expect(legalStackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })
})

describe('unstackTargets', () => {
  it('offers adjacent empty legal squares for a two-high bastion', () => {
    const b = board([{ row: 4, col: 4, kind: 'Bastion', owner: 'P1', orientation: null, health: 2 }])
    expect(unstackTargets(b, { row: 4, col: 4 }, 'P1')).toHaveLength(8)
  })

  it('excludes the laser emitter and the opponent\'s restricted squares', () => {
    const b = board([{ row: 6, col: 9, kind: 'Bastion', owner: 'P1', orientation: null, health: 2 }])
    const dest = keys(unstackTargets(b, { row: 6, col: 9 }, 'P1'))
    expect(dest.has(coordKey(EMITTER.P1))).toBe(false)
  })

  it('is empty for a single bastion', () => {
    const b = board([{ row: 4, col: 4, kind: 'Bastion', owner: 'P1', orientation: null, health: 1 }])
    expect(unstackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })
})
