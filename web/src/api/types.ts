// Wire types — mirror api/Contracts/* on the backend. Enum-valued fields are the
// backend's PascalCase strings ("Pyramid", "P1", "NW", "Up"), sent as-is.

export type PieceKind = 'Pyramid' | 'Obelisk' | 'Djed' | 'Pharaoh' | 'Sphinx' | 'Anubis'
export type Player = 'P1' | 'P2'
/** A room seat: one of the two players, or a spectator. */
export type Seat = Player | 'Spectator'
export type Orientation = 'NW' | 'NE' | 'SE' | 'SW'
export type GameStatus = 'InProgress' | 'P1Win' | 'P2Win'
/** Why a finished game ended, when it wasn't an ordinary Pharaoh elimination. */
export type EndReason = 'Pharaoh' | 'Timeout' | 'Abandonment' | 'Resignation'
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

/**
 * A seat's rendered identity + rating, joined server-side from the account attached to it (see
 * `plans/04-player-profile-board-identity.md`). `avatarId` is one of the fixed 8 preset ids (see
 * `components/Avatar.tsx`'s `AVATAR_IDS`), or null for the initial-letter fallback. `rating` is
 * the category bucket matching *this game's* `timeControl` (0 for an untimed game — no bucket
 * applies, and the wire contract deliberately never omits this field instead).
 */
export interface PlayerSummary {
  displayName: string
  avatarId: string | null
  rating: number
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
  /** Null while that seat is still anonymous/unclaimed — see `PlayerSummary`'s doc. */
  p1Profile: PlayerSummary | null
  p2Profile: PlayerSummary | null
  /** Chess-clock preset name (see `game/timeControls.ts`), or null = untimed (always null for
   *  local/solo play — the clock is multiplayer-room-only). */
  timeControl: string | null
  /** Banked remaining time in ms; null for an untimed room or a Daily game (no live balance —
   *  Daily just resets `turnDeadlineUtc` every move instead). */
  p1RemainingMs: number | null
  p2RemainingMs: number | null
  /** ISO 8601. When the current mover's clock (or Daily's day-window) started; null when untimed. */
  turnStartedAtUtc: string | null
  /** ISO 8601. Forfeit-if-not-moved-by time; drives all timeout detection. Null when untimed. */
  turnDeadlineUtc: string | null
  /**
   * ISO 8601, ALWAYS present (even for an untimed game) — the server's own clock at response
   * time. Load-bearing, not decoration: the client must never tick a countdown against its own
   * clock (real client clock skew is common). Compute `offset = serverNowUtc - Date.now()` once
   * per payload and tick against `Date.now() + offset` thereafter.
   */
  serverNowUtc: string
  /** Computed server-side on every GET: true when `status` is `"InProgress"` and `serverNowUtc`
   *  has passed `turnDeadlineUtc` — lets a client that merely loaded a stale game (most useful
   *  for Daily, which has no live ticking UI) immediately offer "claim win" without waiting for
   *  a local tick to notice. Always false for an untimed or already-finished game. */
  timedOut: boolean
  /** Mirrors `Domain.Game.EndReason` directly — null while `status` is `"InProgress"`,
   *  `"Pharaoh"`, `"Timeout"` or `"Resignation"` once finished. Distinguishes a timeout/
   *  resignation win from an ordinary Pharaoh-elimination one after the fact (e.g. on
   *  reload/resync), unlike the live `gameEnded` event or a move-rejection 409, which are the
   *  only other places this shows up. */
  endReason: EndReason | null
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
  /** Same semantics as `GameResponse.endReason` — null while in progress,
   *  `"Pharaoh"`/`"Timeout"`/`"Resignation"` once finished. */
  endReason: EndReason | null
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
  /** Same clock fields as `GameResponse`, minus `timedOut` — inlined here to avoid an extra
   *  round-trip per move, same reason `status`/`currentTurn` already are. See `GameResponse`
   *  for field-by-field docs. */
  timeControl: string | null
  p1RemainingMs: number | null
  p2RemainingMs: number | null
  turnStartedAtUtc: string | null
  turnDeadlineUtc: string | null
  serverNowUtc: string
}

/**
 * Pushed over SignalR when a game ends by timeout — a *new* event, deliberately not an overload
 * of `moveApplied`: no move was actually applied, and `moveApplied`'s usual `moveNumber` guard
 * (see `store.ts`'s `applyRemoteMove`) would silently drop a synthetic one. Fired from both the
 * in-move timeout check and `POST /api/games/{id}/claim-timeout`.
 */
export interface GameEndedEvent {
  status: GameStatus
  endReason: EndReason
  serverNowUtc: string
}

/**
 * Pushed over SignalR when a tracked seat's connection drops while the game is `InProgress` —
 * the seed for the disconnect-banner countdown toward a claimable `claim-abandonment`. See
 * `plans/02-disconnect-abandonment.md`'s wire contract.
 */
export interface OpponentDisconnectedEvent {
  seat: Player
  disconnectedAtUtc: string
}

/** Pushed when that seat calls `Join` again before anyone successfully claims abandonment. */
export interface OpponentReconnectedEvent {
  seat: Player
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
