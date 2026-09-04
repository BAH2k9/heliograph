import { describe, expect, it } from 'vitest'
import type { BoardState, Player } from '../api/types'
import { identify, type ClientBoard } from './board'
import { coordKey } from './coords'
import {
  EMITTER,
  canRotate,
  legalDestinations,
  legalStackTargets,
  sphinxFacings,
  squareOwner,
  unstackTargets,
} from './rules'

function board(pieces: BoardState['pieces']): ClientBoard {
  return identify({ rows: 8, cols: 10, pieces })
}

function keys(cs: { row: number; col: number }[]): Set<string> {
  return new Set(cs.map(coordKey))
}

// Parity with GameEngine.SquareOwner in api/Engine/GameEngine.cs.
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
  it('is true for pyramids, djeds, the sphinx and the anubis', () => {
    expect(canRotate({ id: 'a', row: 0, col: 0, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null })).toBe(true)
    expect(canRotate({ id: 'b', row: 0, col: 0, kind: 'Djed', owner: 'P1', orientation: 'NE', health: null })).toBe(true)
    expect(canRotate({ id: 'e', row: 7, col: 9, kind: 'Sphinx', owner: 'P1', orientation: 'NE', health: null })).toBe(true)
    expect(canRotate({ id: 'f', row: 0, col: 0, kind: 'Anubis', owner: 'P1', orientation: 'NW', health: null })).toBe(true)
    expect(canRotate({ id: 'c', row: 0, col: 0, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 })).toBe(false)
    expect(canRotate({ id: 'd', row: 0, col: 0, kind: 'Pharaoh', owner: 'P1', orientation: null, health: null })).toBe(false)
  })
})

// Parity with GameEngine.SphinxFacings.
describe('sphinxFacings', () => {
  it('gives P1 corner NE/NW and P2 corner SW/SE, null elsewhere', () => {
    expect(sphinxFacings({ row: 7, col: 9 })).toEqual(['NE', 'NW'])
    expect(sphinxFacings({ row: 0, col: 0 })).toEqual(['SW', 'SE'])
    expect(sphinxFacings({ row: 4, col: 4 })).toBeNull()
  })
})

describe('legalDestinations — parity with GameEngine.ValidateMove (Move branch)', () => {
  it('is empty when the square is empty or the piece is not the mover’s', () => {
    const b = board([{ row: 4, col: 4, kind: 'Pyramid', owner: 'P2', orientation: 'NE', health: null }])
    expect(legalDestinations(b, { row: 4, col: 4 }, 'P1')).toEqual([])
    expect(legalDestinations(b, { row: 0, col: 0 }, 'P2')).toEqual([])
  })

  it('offers all 8 adjacent empty neutral squares', () => {
    const b = board([{ row: 4, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }])
    expect(legalDestinations(b, { row: 4, col: 4 }, 'P1')).toHaveLength(8)
  })

  it('excludes the opponent’s restricted squares but allows the mover’s own', () => {
    const b = board([{ row: 1, col: 1, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }])
    const dest = keys(legalDestinations(b, { row: 1, col: 1 }, 'P1'))
    expect(dest.has(coordKey({ row: 0, col: 0 }))).toBe(false) // P2 column
    expect(dest.has(coordKey({ row: 2, col: 0 }))).toBe(false)
    expect(dest.has(coordKey({ row: 0, col: 1 }))).toBe(true) // P1 restricted, own
    expect(dest.has(coordKey({ row: 1, col: 2 }))).toBe(true) // neutral
  })

  it('never offers the laser emitter square', () => {
    const b = board([{ row: 6, col: 9, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }])
    const dest = keys(legalDestinations(b, { row: 6, col: 9 }, 'P1'))
    expect(dest.has(coordKey(EMITTER.P1))).toBe(false)
  })

  it('is empty for a sphinx — it never moves', () => {
    const b = board([{ row: 7, col: 9, kind: 'Sphinx', owner: 'P1', orientation: 'NE', health: null }])
    expect(legalDestinations(b, { row: 7, col: 9 }, 'P1')).toEqual([])
  })

  it('blocks an occupied square for a non-Djed but allows a Djed swap with a pyramid or obelisk', () => {
    const withPyr = board([
      { row: 4, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Pyramid', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(withPyr, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(false)

    const djedVsPyr = board([
      { row: 4, col: 4, kind: 'Djed', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Pyramid', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(djedVsPyr, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(true)

    const djedVsDjed = board([
      { row: 4, col: 4, kind: 'Djed', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Djed', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(djedVsDjed, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(false)

    const djedVsAnubis = board([
      { row: 4, col: 4, kind: 'Djed', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Anubis', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(keys(legalDestinations(djedVsAnubis, { row: 4, col: 4 }, 'P1')).has(coordKey({ row: 4, col: 5 }))).toBe(true)
  })
})

// Parity with GameEngine.ValidateStack / ValidateUnstack.
describe('legalStackTargets', () => {
  it('offers an adjacent owned single obelisk as a stack target', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 },
      { row: 4, col: 5, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 },
    ])
    expect(keys(legalStackTargets(b, { row: 4, col: 4 }, 'P1'))).toEqual(keys([{ row: 4, col: 5 }]))
  })

  it('excludes an enemy obelisk, a non-obelisk, and an already-stacked target', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 },
      { row: 4, col: 5, kind: 'Obelisk', owner: 'P2', orientation: null, health: 1 },
      { row: 3, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null },
      { row: 5, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 },
    ])
    expect(legalStackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })

  it('is empty when the selected obelisk is already two-high', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 },
      { row: 4, col: 5, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 },
    ])
    expect(legalStackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })

  it('is empty for a non-obelisk', () => {
    const b = board([{ row: 4, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }])
    expect(legalStackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })
})

describe('unstackTargets', () => {
  it('offers adjacent empty legal squares for a two-high obelisk', () => {
    const b = board([{ row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 }])
    expect(unstackTargets(b, { row: 4, col: 4 }, 'P1')).toHaveLength(8)
  })

  it('excludes the laser emitter and the opponent\'s restricted squares', () => {
    const b = board([{ row: 6, col: 9, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 }])
    const dest = keys(unstackTargets(b, { row: 6, col: 9 }, 'P1'))
    expect(dest.has(coordKey(EMITTER.P1))).toBe(false)
  })

  it('is empty for a single obelisk', () => {
    const b = board([{ row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 }])
    expect(unstackTargets(b, { row: 4, col: 4 }, 'P1')).toEqual([])
  })
})
