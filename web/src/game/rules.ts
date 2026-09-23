import type { Coord, Player } from '../api/types'
import { COLS, neighbours, sameCoord } from './coords'
import { pieceAt, type ClientBoard, type IdentifiedPiece } from './board'

export { heliostatFacings } from './coords'

// --- Static rule data, mirrored by hand from GameEngine.SquareOwner / EmitterFor. ---
// Keep in sync with Heliograph.Engine/GameEngine.cs. Covered by rules.test.ts.

/** The square a player may not move a piece onto (their own laser source / Heliostat square). */
export const EMITTER: Record<Player, Coord> = {
  P1: { row: 7, col: 9 },
  P2: { row: 0, col: 0 },
}

/** Which player a square is reserved for, or null if neutral. A player may not enter the other's. */
export function squareOwner(c: Coord): Player | null {
  if (c.col === COLS - 1 || (c.row === 0 && c.col === 1) || (c.row === 7 && c.col === 1)) return 'P1'
  if (c.col === 0 || (c.row === 0 && c.col === 8) || (c.row === 7 && c.col === 8)) return 'P2'
  return null
}

export function canRotate(piece: IdentifiedPiece): boolean {
  return (
    piece.kind === 'Mirror' ||
    piece.kind === 'Swivel' ||
    piece.kind === 'Heliostat' ||
    piece.kind === 'Sentinel'
  )
}

function isEmitter(c: Coord): boolean {
  return sameCoord(c, EMITTER.P1) || sameCoord(c, EMITTER.P2)
}

/**
 * Squares the piece at `from` may move to this turn. Empty if there is no piece there,
 * it is not `turn`'s, or it has no legal move. Mirrors GameEngine.ValidateMove for the
 * Move branch — the server stays the referee; this is only for highlighting and snap-back.
 */
export function legalDestinations(board: ClientBoard, from: Coord, turn: Player): Coord[] {
  const piece = pieceAt(board, from)
  if (!piece || piece.owner !== turn) return []
  if (piece.kind === 'Heliostat') return [] // the Heliostat never moves — its turn is a rotate

  return neighbours(from).filter((to) => {
    if (isEmitter(to)) return false

    const owner = squareOwner(to)
    if (owner !== null && owner !== turn) return false

    const occupant = pieceAt(board, to)
    if (!occupant) return true

    // Swivel swap: onto an adjacent mirror, bastion or sentinel (either colour).
    return (
      piece.kind === 'Swivel' &&
      (occupant.kind === 'Mirror' || occupant.kind === 'Bastion' || occupant.kind === 'Sentinel')
    )
  })
}

function isOwnedSingleBastion(piece: IdentifiedPiece | undefined, turn: Player): boolean {
  return piece != null && piece.owner === turn && piece.kind === 'Bastion' && (piece.health ?? 1) === 1
}

/**
 * Adjacent squares holding one of `turn`'s own single bastions — the legal stack targets for a
 * selected single bastion. Empty unless the piece at `from` is itself an owned single bastion.
 * Classic-ruleset only (the caller gates on the ruleset). Mirrors GameEngine.ValidateStack.
 */
export function legalStackTargets(board: ClientBoard, from: Coord, turn: Player): Coord[] {
  if (!isOwnedSingleBastion(pieceAt(board, from), turn)) return []

  return neighbours(from).filter((to) => {
    const owner = squareOwner(to)
    if (owner !== null && owner !== turn) return false
    return isOwnedSingleBastion(pieceAt(board, to), turn)
  })
}

/**
 * Adjacent empty, legal squares a selected two-high bastion may drop its top piece onto.
 * Empty unless the piece at `from` is an owned two-high bastion. Mirrors GameEngine.ValidateUnstack.
 */
export function unstackTargets(board: ClientBoard, from: Coord, turn: Player): Coord[] {
  const piece = pieceAt(board, from)
  if (!piece || piece.owner !== turn || piece.kind !== 'Bastion' || (piece.health ?? 1) !== 2) return []

  return neighbours(from).filter((to) => {
    if (isEmitter(to)) return false
    const owner = squareOwner(to)
    if (owner !== null && owner !== turn) return false
    return !pieceAt(board, to)
  })
}
