// Wire types — mirror api/Contracts/* on the backend. Enum-valued fields are the
// backend's PascalCase strings ("Pyramid", "P1", "NW", "Up"), sent as-is.

export type PieceKind = 'Pyramid' | 'Obelisk' | 'Djed' | 'Pharaoh'
export type Player = 'P1' | 'P2'
export type Orientation = 'NW' | 'NE' | 'SE' | 'SW'
export type GameStatus = 'InProgress' | 'P1Win' | 'P2Win'
export type LaserEdge = 'Top' | 'Bottom' | 'Left' | 'Right'
export type LaserTermination = 'ExitedBoard' | 'Absorbed' | 'HitPharaoh'
export type RotationDir = 'CW' | 'CCW'

export interface Coord {
  row: number
  col: number
}

export interface BoardPiece {
  row: number
  col: number
  kind: PieceKind
  owner: Player
  /** null for Obelisk and Pharaoh. */
  orientation: Orientation | null
  /** Set only for Obelisk (2, then 1). */
  health: number | null
}

export interface BoardState {
  rows: number
  cols: number
  pieces: BoardPiece[]
}

export interface GameResponse {
  id: string
  status: GameStatus
  currentTurn: Player
  moveCount: number
  boardState: BoardState
}

export interface LaserSegment {
  row: number
  col: number
  enter: LaserEdge
  /** null where the beam stopped in this square. */
  exit: LaserEdge | null
}

export interface EliminatedPiece {
  row: number
  col: number
  kind: PieceKind
  owner: Player
}

export interface DamagedPiece {
  row: number
  col: number
  healthRemaining: number
}

export interface SubmitMoveResponse {
  boardState: BoardState
  /** Ordered emitter -> terminus. */
  laserSegments: LaserSegment[]
  eliminated: EliminatedPiece[]
  damaged: DamagedPiece[]
  status: GameStatus
  currentTurn: Player
  moveNumber: number
}

export type MoveRequest =
  | { type: 'move'; from: Coord; to: Coord }
  | { type: 'rotate'; from: Coord; rotation: RotationDir }
