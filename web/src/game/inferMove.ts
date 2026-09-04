import type { BoardState, Coord, EliminatedPiece, MoveRequest } from '../api/types'
import type { ClientBoard } from './board'
import { coordKey, rotate } from './coords'

/**
 * Reconstructs the move an opponent just made from the board *before* it and the server's
 * post-laser response, so a pushed update can reuse the local slide / rotate / swap animation
 * path in the store. Returns `null` when the delta is ambiguous — the caller then snaps
 * straight to the server board (beam still plays, no slide).
 *
 * The response board is post-laser, so eliminated squares are re-added to approximate the
 * post-move, pre-laser occupancy; the move itself is then visible as the occupancy delta.
 */
export function inferMove(
  before: ClientBoard,
  after: BoardState,
  eliminated: EliminatedPiece[],
): MoveRequest | null {
  const parse = (k: string): Coord => {
    const [row, col] = k.split(',').map(Number)
    return { row, col }
  }

  const beforeOccupied = new Set(before.pieces.map(coordKey))
  const afterOccupied = new Set<string>([
    ...after.pieces.map(coordKey),
    ...eliminated.map(coordKey),
  ])

  const vacated = [...beforeOccupied].filter((k) => !afterOccupied.has(k))
  const filled = [...afterOccupied].filter((k) => !beforeOccupied.has(k))

  // Straight slide into a previously empty square.
  if (vacated.length === 1 && filled.length === 1) {
    return { type: 'move', from: parse(vacated[0]), to: parse(filled[0]) }
  }

  // Occupancy unchanged: a rotate in place, or a Djed swap (two pieces trade squares).
  if (vacated.length === 0 && filled.length === 0) {
    const beforeByKey = new Map(before.pieces.map((p) => [coordKey(p), p]))
    const changed = after.pieces.filter((a) => {
      const b = beforeByKey.get(coordKey(a))
      return !b || b.kind !== a.kind || b.owner !== a.owner || b.orientation !== a.orientation
    })

    // Rotate: one square, same piece, new orientation.
    if (changed.length === 1) {
      const a = changed[0]
      const b = beforeByKey.get(coordKey(a))
      if (a.orientation && b?.orientation) {
        const dir = rotate(b.orientation, 'CW') === a.orientation ? 'CW' : 'CCW'
        return { type: 'rotate', from: { row: a.row, col: a.col }, rotation: dir }
      }
      return null
    }

    // Djed swap: two squares whose occupant changed. `from` is where the Djed started.
    if (changed.length === 2) {
      const djedStart = changed
        .map((a) => beforeByKey.get(coordKey(a)))
        .find((b) => b?.kind === 'Djed')
      const other = changed.find((a) => beforeByKey.get(coordKey(a))?.kind !== 'Djed')
      if (djedStart && other) {
        return {
          type: 'move',
          from: { row: djedStart.row, col: djedStart.col },
          to: { row: other.row, col: other.col },
        }
      }
    }
  }

  return null
}
