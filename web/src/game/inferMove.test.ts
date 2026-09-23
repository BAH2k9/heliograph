import { describe, expect, it } from 'vitest'
import type { BoardPiece, BoardState, EliminatedPiece } from '../api/types'
import { identify } from './board'
import { inferMove } from './inferMove'

const bs = (pieces: Partial<BoardPiece>[]): BoardState => ({
  rows: 8,
  cols: 10,
  pieces: pieces.map((p) => ({
    row: 0,
    col: 0,
    kind: 'Mirror',
    owner: 'P1',
    orientation: 'NW',
    health: null,
    ...p,
  })),
})

const noKills: EliminatedPiece[] = []

describe('inferMove', () => {
  it('reads a straight slide into an empty square', () => {
    const before = identify(bs([{ row: 2, col: 3 }, { row: 7, col: 7, kind: 'Keep', owner: 'P2', orientation: null }]))
    const after = bs([{ row: 2, col: 4 }, { row: 7, col: 7, kind: 'Keep', owner: 'P2', orientation: null }])

    expect(inferMove(before, after, noKills)).toEqual({
      type: 'move',
      from: { row: 2, col: 3 },
      to: { row: 2, col: 4 },
    })
  })

  it('reads a clockwise rotation in place', () => {
    const before = identify(bs([{ row: 0, col: 0, orientation: 'NW' }]))
    const after = bs([{ row: 0, col: 0, orientation: 'NE' }])

    expect(inferMove(before, after, noKills)).toEqual({
      type: 'rotate',
      from: { row: 0, col: 0 },
      rotation: 'CW',
    })
  })

  it('reads a counter-clockwise rotation in place', () => {
    const before = identify(bs([{ row: 4, col: 5, orientation: 'NW' }]))
    const after = bs([{ row: 4, col: 5, orientation: 'SW' }])

    expect(inferMove(before, after, noKills)).toEqual({
      type: 'rotate',
      from: { row: 4, col: 5 },
      rotation: 'CCW',
    })
  })

  it('reads a Swivel swap as a move from the Swivel square onto its partner', () => {
    const before = identify(
      bs([
        { row: 3, col: 3, kind: 'Swivel', orientation: 'NW' },
        { row: 3, col: 4, kind: 'Mirror', orientation: 'SE' },
      ]),
    )
    const after = bs([
      { row: 3, col: 4, kind: 'Swivel', orientation: 'NW' },
      { row: 3, col: 3, kind: 'Mirror', orientation: 'SE' },
    ])

    expect(inferMove(before, after, noKills)).toEqual({
      type: 'move',
      from: { row: 3, col: 3 },
      to: { row: 3, col: 4 },
    })
  })

  it('reads a slide even when the moved piece is then destroyed by its own laser', () => {
    const before = identify(bs([{ row: 2, col: 3 }, { row: 7, col: 7, kind: 'Keep', owner: 'P2', orientation: null }]))
    const after = bs([{ row: 7, col: 7, kind: 'Keep', owner: 'P2', orientation: null }])
    const eliminated: EliminatedPiece[] = [{ row: 2, col: 4, kind: 'Mirror', owner: 'P1' }]

    expect(inferMove(before, after, eliminated)).toEqual({
      type: 'move',
      from: { row: 2, col: 3 },
      to: { row: 2, col: 4 },
    })
  })

  it('reads a slide when the laser kills a different piece elsewhere', () => {
    const before = identify(
      bs([
        { row: 2, col: 3 },
        { row: 5, col: 5, kind: 'Bastion', owner: 'P2', orientation: null, health: 1 },
        { row: 7, col: 7, kind: 'Keep', owner: 'P2', orientation: null },
      ]),
    )
    const after = bs([
      { row: 2, col: 4 },
      { row: 7, col: 7, kind: 'Keep', owner: 'P2', orientation: null },
    ])
    const eliminated: EliminatedPiece[] = [{ row: 5, col: 5, kind: 'Bastion', owner: 'P2' }]

    expect(inferMove(before, after, eliminated)).toEqual({
      type: 'move',
      from: { row: 2, col: 3 },
      to: { row: 2, col: 4 },
    })
  })

  it('reads a stack as the source bastion merging into an adjacent single bastion', () => {
    const before = identify(
      bs([
        { row: 4, col: 4, kind: 'Bastion', orientation: null, health: 1 },
        { row: 4, col: 5, kind: 'Bastion', orientation: null, health: 1 },
      ]),
    )
    const after = bs([{ row: 4, col: 5, kind: 'Bastion', orientation: null, health: 2 }])

    expect(inferMove(before, after, noKills)).toEqual({
      type: 'stack',
      from: { row: 4, col: 4 },
      to: { row: 4, col: 5 },
    })
  })

  it('reads an unstack as a two-high bastion dropping one onto an adjacent empty square', () => {
    const before = identify(bs([{ row: 4, col: 4, kind: 'Bastion', orientation: null, health: 2 }]))
    const after = bs([
      { row: 4, col: 4, kind: 'Bastion', orientation: null, health: 1 },
      { row: 4, col: 5, kind: 'Bastion', orientation: null, health: 1 },
    ])

    expect(inferMove(before, after, noKills)).toEqual({
      type: 'unstack',
      from: { row: 4, col: 4 },
      to: { row: 4, col: 5 },
    })
  })

  it('returns null when the delta is ambiguous', () => {
    const before = identify(bs([{ row: 0, col: 0 }, { row: 1, col: 1 }]))
    const after = bs([{ row: 5, col: 5 }, { row: 6, col: 6 }])

    expect(inferMove(before, after, noKills)).toBeNull()
  })
})
