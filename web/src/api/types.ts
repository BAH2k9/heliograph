// Wire types — mirror Heliograph.Contracts/* on the backend. Enum-valued fields are the
// backend's PascalCase strings ("Pyramid", "P1", "NW", "Up"), sent as-is.

import type { RatingBucket } from './authTypes'

export type PieceKind = 'Pyramid' | 'Obelisk' | 'Djed' | 'Pharaoh' | 'Sphinx' | 'Anubis'
export type Player = 'P1' | 'P2'
/** A room seat: one of the two players, or a spectator. */
export type Seat = Player | 'Spectator'
export type Orientation = 'NW' | 'NE' | 'SE' | 'SW'
export type GameStatus = 'InProgress' | 'P1Win' | 'P2Win'
/** Why a finished game ended, when it wasn't an ordinary Keep elimination. `"Aborted"` is an
 *  admin force-end (`POST /api/admin/games/{id}/force-end`) — a winner is still recorded, but no
 *  Elo moved. UI that maps this to a label may fall through to the plain-win text for `"Aborted"`. */
export type EndReason = 'Pharaoh' | 'Timeout' | 'Abandonment' | 'Resignation' | 'Aborted'
export type LaserEdge = 'Top' | 'Bottom' | 'Left' | 'Right'
export type LaserTermination = 'ExitedBoard' | 'Absorbed' | 'HitPharaoh'
export type RotationDir = 'CW' | 'CCW'
/** See `backlog/08-bot-opponent.md` — the three fixed bot-strength tiers. */
export type BotDifficulty = 'Easy' | 'Medium' | 'Hard'

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
 * `backlog/04-player-profile-board-identity.md`). `avatarId` is one of the fixed 8 preset ids (see
 * `components/Avatar.tsx`'s `AVATAR_IDS`), or null for the initial-letter fallback. `rating` is
 * the category bucket matching *this game's* `timeControl` (0 for an untimed game — no bucket
 * applies, and the wire contract deliberately never omits this field instead).
 */
export interface PlayerSummary {
  displayName: string
  avatarId: string | null
  rating: number
}

/**
 * The trimmed public profile for one seat, from `GET /api/games/{id}/players/{seat}` — the
 * in-game player-info popup's opt-in fetch (`backlog/09-player-info-popup.md`). No email, no
 * account id, no games list — unlike `PlayerSummary` this is fetched on demand, not embedded in
 * `GameResponse`, since it deliberately relaxes the "no identity on the passive wire" stance.
 */
export interface PublicPlayerProfile {
  displayName: string
  avatarId: string | null
  totalGamesPlayed: number
  ratings: RatingBucket[]
}

export interface GameResponse {
  id: string
  status: GameStatus
  currentTurn: Player
  moveCount: number
  boardState: BoardState
  /** Name of the rule variant (e.g. "Classic"). Fixed for the life of the game. */
  ruleset: string
  /** Name of the starting layout the game was created from (e.g. "Dawn"). */
  layout: string
  /** True only when both seats were filled by already-authenticated accounts at create/join
   *  time. */
  rated: boolean
  /** Whether an account has claimed each seat — no account ids exposed, so a spectator can't
   *  tell who's playing off the wire. */
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
   *  resignation win from an ordinary Keep-elimination one after the fact (e.g. on
   *  reload/resync), unlike the live `gameEnded` event or a move-rejection 409, which are the
   *  only other places this shows up. */
  endReason: EndReason | null
  /** Which seat, if any, the server plays as a bot (see `backlog/08-bot-opponent.md`) — null for an
   *  ordinary human-vs-human game. Fixed for the life of the game; used client-side to refuse
   *  letting the human act on the bot's turn and to show a "bot is thinking…" indicator, and
   *  carried across reconnect/resume since this is the only place a resumed client learns it. */
  botSeat: Player | null
  /** The bot's difficulty tier when `botSeat` is set, else null. */
  botDifficulty: BotDifficulty | null
  /** Set once both seats have requested a rematch (`POST /api/games/{id}/rematch`) — the new
   *  room's id. Null before that. The fallback a client that missed the `rematchReady` hub push
   *  still finds on its next `GET`. */
  rematchGameId: string | null
  /** "P1"/"P2" when the authenticated caller holds that seat, else null (spectator, unclaimed
   *  seat, or a non-account-attached local/bot game) — computed server-side from the caller's own
   *  identity, unlike `SubmitMoveRequest`'s own `seat`, which is only ever loosely self-checked
   *  against whose turn it currently is. Lets a client that re-discovers an in-progress game
   *  outside the normal room-join flow (no join-code URL params to read a seat back out of — see
   *  the active-game-banner boot recovery in `store.ts`'s `recoverActiveGame`) learn which seat,
   *  if any, it's actually authorized to act as. */
  mySeat: Player | null
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
  /** Correlation id for this move's full lifecycle (REST request -> server log -> hub broadcast)
   *  — the `X-Trace-Id` `authFetch` attaches to every request, echoed back here so the ring
   *  buffer and a filed bug report can key off it. See `backlog/10-bug-traceability.md`. */
  traceId: string | null
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
  /** Same correlation id as `SubmitMoveResponse.traceId` — the `X-Trace-Id` of the REST call
   *  (claim-timeout, claim-abandonment, resign, or the in-move timeout check) that produced this
   *  ending. See `backlog/10-bug-traceability.md`. */
  traceId: string | null
}

/**
 * Pushed over SignalR when a tracked seat's connection drops while the game is `InProgress` —
 * the seed for the disconnect-banner countdown toward a claimable `claim-abandonment`. See
 * `backlog/02-disconnect-abandonment.md`'s wire contract.
 */
export interface OpponentDisconnectedEvent {
  seat: Player
  disconnectedAtUtc: string
}

/** Pushed when that seat calls `Join` again before anyone successfully claims abandonment. */
export interface OpponentReconnectedEvent {
  seat: Player
}

/**
 * Pushed to everyone else in the group when a seat joins for the first time (not a reconnect) —
 * chiefly the second player entering a room. The receiver has no seat-profile data for the new
 * player yet and no other push would deliver it, so this is the cue to `resync()` against REST.
 */
export interface OpponentJoinedEvent {
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
  // Classic stacking: merge a single Bastion onto an adjacent friendly single Bastion (`to`),
  // or split a two-high Bastion, dropping one onto an adjacent empty square (`to`).
  | { type: 'stack'; from: Coord; to: Coord }
  | { type: 'unstack'; from: Coord; to: Coord }

/** Response to POST /api/rooms and POST /api/rooms/{code}/join. */
export interface RoomResponse {
  gameId: string
  code: string
  seat: Seat
}

/**
 * Pushed to the game's group when one seat requests a rematch (`POST /api/games/{id}/rematch`)
 * but the other seat hasn't asked yet — the cue for the *other* seat's client to show the "your
 * opponent wants a rematch" banner. `seat` is whichever seat just asked, never the receiver's own.
 */
export interface RematchOfferedEvent {
  seat: Player
}

/**
 * Pushed to the game's group once both seats have requested a rematch — both clients (including
 * the original requester, who was sitting on "waiting for opponent") should enter this room. Each
 * client works out its own new seat locally by flipping the seat it already held, since a rematch
 * always swaps seats (see `RoomResponse` returned directly to whichever call completed the match).
 */
export interface RematchReadyEvent {
  gameId: string
  code: string
}

/** Pushed when either seat declines a pending rematch request — resets the other seat's "waiting
 *  for opponent" UI back to a plain "Play again" button. `seat` is whoever declined. */
export interface RematchDeclinedEvent {
  seat: Player
}
