// Wire types — mirror api/Contracts/* on the backend. Enum-valued fields are the
// backend's PascalCase strings ("Pyramid", "P1", "NW", "Up"), sent as-is.

export type PieceKind = 'Pyramid' | 'Obelisk' | 'Djed' | 'Pharaoh' | 'Sphinx' | 'Anubis'
export type Player = 'P1' | 'P2'
/** A room seat: one of the two players, or a spectator. */
export type Seat = Player | 'Spectator'
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
  /** Name of the rule variant (e.g. "Classic"). Fixed for the life of the game. */
  ruleset: string
  /** Name of the starting layout the game was created from (e.g. "Classic"). */
  layout: string
  /** True only when both seats were filled by already-authenticated accounts at create/join
   *  time — claiming a seat after the fact (see `claimSeat`) never sets this. */
  rated: boolean
  /** Whether an account has claimed each seat — no account ids exposed, so a spectator can't
   *  tell who's playing off the wire. Used to hide the "claim this seat" prompt once claimed. */
  p1Claimed: boolean
  p2Claimed: boolean
}

/** One row of `GET /api/games` — a light summary for a list view, no board state. */
export interface GameSummary {
  id: string
  createdAtUtc: string
  /** Set once, when the game ends; null while `status` is `"InProgress"`. */
  finishedAtUtc: string | null
  status: GameStatus
  ruleset: string
  layout: string
  rated: boolean
  moveCount: number
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

export interface EmitterInfo {
  row: number
  col: number
  direction: string
}

/** The full trace of one fired laser — one entry in a `MoveHistoryItem`. */
export interface LaserResult {
  firedBy: Player
  emitter: EmitterInfo
  termination: LaserTermination
  segments: LaserSegment[]
  hitCell: Coord | null
  eliminated: EliminatedPiece[]
  damaged: DamagedPiece[]
}

/** One entry of `GET /api/games/{id}/moves`, in `moveNumber` order. */
export interface MoveHistoryItem {
  moveNumber: number
  player: Player
  type: 'Move' | 'Rotate' | 'Stack' | 'Unstack'
  from: Coord
  to: Coord | null
  rotation: RotationDir | null
  laserResult: LaserResult
  /** The board exactly as it stood right after this move's laser fired. */
  boardState: BoardState
  createdAtUtc: string
}

/** Full response of `GET /api/games/{id}/moves` — the board before move 1, plus every move. */
export interface GameHistoryResponse {
  startingBoardState: BoardState
  moves: MoveHistoryItem[]
}

export type MoveRequest =
  | { type: 'move'; from: Coord; to: Coord }
  | { type: 'rotate'; from: Coord; rotation: RotationDir }
  // Classic stacking: merge a single obelisk onto an adjacent friendly single obelisk (`to`),
  // or split a two-high obelisk, dropping one onto an adjacent empty square (`to`).
  | { type: 'stack'; from: Coord; to: Coord }
  | { type: 'unstack'; from: Coord; to: Coord }

/** Response to POST /api/rooms and POST /api/rooms/{code}/join. */
export interface RoomResponse {
  gameId: string
  code: string
  seat: Seat
}
