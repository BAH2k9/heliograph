import type { BoardState, Coord, EliminatedPiece, MoveRequest } from '../api/types'
import type { ClientBoard } from './board'
import { coordKey, neighbours, rotate } from './coords'

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

  const beforeByKey = new Map(before.pieces.map((p) => [coordKey(p), p]))
  const afterByKey = new Map(after.pieces.map((p) => [coordKey(p), p]))

  // Stack: an bastion vacates its square, merging into an adjacent friendly bastion (health 1 -> 2).
  if (vacated.length === 1 && filled.length === 0) {
    const from = parse(vacated[0])
    const gone = beforeByKey.get(coordKey(from))
    if (gone?.kind === 'Bastion') {
      const target = neighbours(from).find((c) => {
        const a = afterByKey.get(coordKey(c))
        const b = beforeByKey.get(coordKey(c))
        return (
          a?.kind === 'Bastion' && a.owner === gone.owner && (a.health ?? 1) === 2 && (b?.health ?? 1) === 1
        )
      })
      if (target) return { type: 'stack', from, to: target }
    }
    return null
  }

  // Unstack: an bastion appears on an empty square, split off an adjacent friendly stack (2 -> 1).
  if (vacated.length === 0 && filled.length === 1) {
    const to = parse(filled[0])
    const dropped = afterByKey.get(coordKey(to))
    if (dropped?.kind === 'Bastion') {
      const source = neighbours(to).find((c) => {
        const a = afterByKey.get(coordKey(c))
        const b = beforeByKey.get(coordKey(c))
        return (
          b?.kind === 'Bastion' && b.owner === dropped.owner && (b.health ?? 1) === 2 && (a?.health ?? 1) === 1
        )
      })
      if (source) return { type: 'unstack', from: source, to }
    }
    return null
  }

  // Occupancy unchanged: a rotate in place, or a Swivel swap (two pieces trade squares).
  if (vacated.length === 0 && filled.length === 0) {
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

    // Swivel swap: two squares whose occupant changed. `from` is where the Swivel started.
    if (changed.length === 2) {
      const swivelStart = changed
        .map((a) => beforeByKey.get(coordKey(a)))
        .find((b) => b?.kind === 'Swivel')
      const other = changed.find((a) => beforeByKey.get(coordKey(a))?.kind !== 'Swivel')
      if (swivelStart && other) {
        return {
          type: 'move',
          from: { row: swivelStart.row, col: swivelStart.col },
          to: { row: other.row, col: other.col },
        }
      }
    }
  }

  return null
}
