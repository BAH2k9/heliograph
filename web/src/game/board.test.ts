import { describe, expect, it } from 'vitest'
import type { BoardState } from '../api/types'
import {
  applyLaserResult,
  applyMove,
  identify,
  matchesServer,
  pieceAt,
  type ClientBoard,
} from './board'

function board(pieces: BoardState['pieces']): ClientBoard {
  return identify({ rows: 8, cols: 10, pieces })
}

describe('identify', () => {
  it('gives every piece a distinct id and keeps its fields', () => {
    const b = board([
      { row: 2, col: 3, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 4, kind: 'Djed', owner: 'P2', orientation: 'NW', health: null },
    ])
    expect(new Set(b.pieces.map((p) => p.id)).size).toBe(2)
    expect(pieceAt(b, { row: 2, col: 3 })?.kind).toBe('Pyramid')
  })
})

describe('applyMove', () => {
  it('moves a piece to an empty square, keeping its id', () => {
    const b = board([{ row: 2, col: 3, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }])
    const id = b.pieces[0].id

    const next = applyMove(b, { type: 'move', from: { row: 2, col: 3 }, to: { row: 2, col: 4 } })

    expect(pieceAt(next, { row: 2, col: 3 })).toBeUndefined()
    expect(pieceAt(next, { row: 2, col: 4 })?.id).toBe(id)
    expect(pieceAt(b, { row: 2, col: 3 })).toBeDefined() // original untouched
  })

  it('swaps a Djed with the piece it moves onto', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Djed', owner: 'P1', orientation: 'NE', health: null },
      { row: 4, col: 5, kind: 'Pyramid', owner: 'P2', orientation: 'NW', health: null },
    ])
    const djedId = pieceAt(b, { row: 4, col: 4 })!.id
    const pyrId = pieceAt(b, { row: 4, col: 5 })!.id

    const next = applyMove(b, { type: 'move', from: { row: 4, col: 4 }, to: { row: 4, col: 5 } })

    expect(pieceAt(next, { row: 4, col: 5 })?.id).toBe(djedId)
    expect(pieceAt(next, { row: 4, col: 4 })?.id).toBe(pyrId)
  })

  it('rotates in place, changing only the orientation', () => {
    const b = board([{ row: 7, col: 2, kind: 'Pyramid', owner: 'P1', orientation: 'NW', health: null }])

    const next = applyMove(b, { type: 'rotate', from: { row: 7, col: 2 }, rotation: 'CW' })

    expect(pieceAt(next, { row: 7, col: 2 })?.orientation).toBe('NE')
    expect(next.pieces).toHaveLength(1)
  })

  it('stacking merges the source into the target, which becomes two-high', () => {
    const b = board([
      { row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 },
      { row: 4, col: 5, kind: 'Obelisk', owner: 'P1', orientation: null, health: 1 },
    ])
    const targetId = pieceAt(b, { row: 4, col: 5 })!.id

    const next = applyMove(b, { type: 'stack', from: { row: 4, col: 4 }, to: { row: 4, col: 5 } })

    expect(pieceAt(next, { row: 4, col: 4 })).toBeUndefined()
    expect(pieceAt(next, { row: 4, col: 5 })?.id).toBe(targetId) // target keeps its id
    expect(pieceAt(next, { row: 4, col: 5 })?.health).toBe(2)
    expect(next.pieces).toHaveLength(1)
  })

  it('unstacking splits a two-high obelisk into two singles with distinct ids', () => {
    const b = board([{ row: 4, col: 4, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 }])
    const sourceId = pieceAt(b, { row: 4, col: 4 })!.id

    const next = applyMove(b, { type: 'unstack', from: { row: 4, col: 4 }, to: { row: 4, col: 5 } })

    expect(pieceAt(next, { row: 4, col: 4 })?.id).toBe(sourceId) // source keeps its id
    expect(pieceAt(next, { row: 4, col: 4 })?.health).toBe(1)
    const dropped = pieceAt(next, { row: 4, col: 5 })
    expect(dropped?.health).toBe(1)
    expect(dropped?.kind).toBe('Obelisk')
    expect(dropped?.owner).toBe('P1')
    expect(dropped?.id).not.toBe(sourceId) // a fresh id, not a duplicate
    expect(next.pieces).toHaveLength(2)
  })

  it('toggles a Sphinx between its two facings, ignoring the rotate direction (mirrors the engine)', () => {
    const b = board([{ row: 7, col: 9, kind: 'Sphinx', owner: 'P1', orientation: 'NE', health: null }])

    const cw = applyMove(b, { type: 'rotate', from: { row: 7, col: 9 }, rotation: 'CW' })
    const ccw = applyMove(b, { type: 'rotate', from: { row: 7, col: 9 }, rotation: 'CCW' })
    expect(pieceAt(cw, { row: 7, col: 9 })?.orientation).toBe('NW')
    expect(pieceAt(ccw, { row: 7, col: 9 })?.orientation).toBe('NW')

    const back = applyMove(cw, { type: 'rotate', from: { row: 7, col: 9 }, rotation: 'CW' })
    expect(pieceAt(back, { row: 7, col: 9 })?.orientation).toBe('NE')
  })
})

describe('applyLaserResult', () => {
  it('removes eliminated pieces and lowers obelisk health', () => {
    const b = board([
      { row: 0, col: 5, kind: 'Pharaoh', owner: 'P2', orientation: null, health: null },
      { row: 7, col: 3, kind: 'Obelisk', owner: 'P1', orientation: null, health: 2 },
    ])

    const next = applyLaserResult(
      b,
      [{ row: 0, col: 5, kind: 'Pharaoh', owner: 'P2' }],
      [{ row: 7, col: 3, healthRemaining: 1 }],
    )

    expect(pieceAt(next, { row: 0, col: 5 })).toBeUndefined()
    expect(pieceAt(next, { row: 7, col: 3 })?.health).toBe(1)
  })
})

describe('matchesServer', () => {
  const server: BoardState = {
    rows: 8,
    cols: 10,
    pieces: [{ row: 2, col: 4, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }],
  }

  it('is true when the computed board agrees piece-for-piece', () => {
    const computed = applyMove(
      board([{ row: 2, col: 3, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null }]),
      { type: 'move', from: { row: 2, col: 3 }, to: { row: 2, col: 4 } },
    )
    expect(matchesServer(computed, server)).toBe(true)
  })

  it('is false when a piece is in the wrong place', () => {
    const computed = board([
      { row: 5, col: 5, kind: 'Pyramid', owner: 'P1', orientation: 'NE', health: null },
    ])
    expect(matchesServer(computed, server)).toBe(false)
  })
})
