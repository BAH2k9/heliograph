import type {
  BoardPiece,
  BoardState,
  Coord,
  DamagedPiece,
  EliminatedPiece,
  MoveRequest,
} from '../api/types'
import { coordKey, rotate, sameCoord, toggleSphinx } from './coords'

/** A wire piece plus a stable id the client assigns and carries across updates. */
export interface IdentifiedPiece extends BoardPiece {
  id: string
}

export interface ClientBoard {
  rows: number
  cols: number
  pieces: IdentifiedPiece[]
}

let idCounter = 0

/** Fresh ids for every piece — used on initial load / GET, where there is no known delta. */
export function identify(board: BoardState): ClientBoard {
  return {
    rows: board.rows,
    cols: board.cols,
    pieces: board.pieces.map((p) => {
      idCounter += 1
      return { ...p, id: `${p.owner}-${p.kind}-${idCounter}` }
    }),
  }
}

export function pieceAt(board: ClientBoard, c: Coord): IdentifiedPiece | undefined {
  return board.pieces.find((p) => p.row === c.row && p.col === c.col)
}

/** Applies a move the client itself submitted, preserving piece ids (mirrors GameEngine.ApplyMove). */
export function applyMove(board: ClientBoard, move: MoveRequest): ClientBoard {
  const from = pieceAt(board, move.from)
  if (!from) return board

  if (move.type === 'rotate') {
    return {
      ...board,
      pieces: board.pieces.map((p) => {
        if (p.id !== from.id || !p.orientation) return p
        // A Sphinx flips between its two board-facing orientations; CW/CCW is ignored.
        const orientation =
          p.kind === 'Sphinx'
            ? toggleSphinx(move.from, p.orientation)
            : rotate(p.orientation, move.rotation)
        return { ...p, orientation }
      }),
    }
  }

  if (move.type === 'stack') {
    const target = pieceAt(board, move.to)
    if (!target) return board
    // The source obelisk merges into the target square, which becomes a two-high stack.
    return {
      ...board,
      pieces: board.pieces
        .filter((p) => p.id !== from.id)
        .map((p) => (p.id === target.id ? { ...p, health: 2 } : p)),
    }
  }

  if (move.type === 'unstack') {
    // Source drops to one; a fresh obelisk (its own id) appears on the empty target square.
    idCounter += 1
    const dropped: IdentifiedPiece = {
      row: move.to.row,
      col: move.to.col,
      kind: 'Obelisk',
      owner: from.owner,
      orientation: null,
      health: 1,
      id: `${from.owner}-Obelisk-${idCounter}`,
    }
    return {
      ...board,
      pieces: [
        ...board.pieces.map((p) => (p.id === from.id ? { ...p, health: 1 } : p)),
        dropped,
      ],
    }
  }

  const target = pieceAt(board, move.to)
  return {
    ...board,
    pieces: board.pieces.map((p) => {
      if (p.id === from.id) return { ...p, row: move.to.row, col: move.to.col }
      if (target && p.id === target.id) return { ...p, row: move.from.row, col: move.from.col }
      return p
    }),
  }
}

/** Removes eliminated pieces and applies obelisk damage after a laser (mirrors the engine result). */
export function applyLaserResult(
  board: ClientBoard,
  eliminated: EliminatedPiece[],
  damaged: DamagedPiece[],
): ClientBoard {
  const dead = new Set(eliminated.map((e) => coordKey(e)))
  const damageByKey = new Map(damaged.map((d) => [coordKey(d), d.healthRemaining]))
  return {
    ...board,
    pieces: board.pieces
      .filter((p) => !dead.has(coordKey(p)))
      .map((p) => {
        const h = damageByKey.get(coordKey(p))
        return h === undefined ? p : { ...p, health: h }
      }),
  }
}

/**
 * The client's computed board should match what the server returned. If it doesn't
 * (a bug or rule drift), the server wins — the caller falls back to `identify(server)`.
 */
export function matchesServer(computed: ClientBoard, server: BoardState): boolean {
  if (computed.pieces.length !== server.pieces.length) return false
  return server.pieces.every((s) =>
    computed.pieces.some(
      (c) =>
        sameCoord(c, s) &&
        c.kind === s.kind &&
        c.owner === s.owner &&
        c.orientation === s.orientation &&
        (c.health ?? null) === (s.health ?? null),
    ),
  )
}
