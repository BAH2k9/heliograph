import type {
  EndReason,
  GameHistoryResponse,
  GameResponse,
  GameStatus,
  GameSummary,
  MoveRequest,
  Player,
  RoomResponse,
  Seat,
  SubmitMoveResponse,
} from './types'
import { authFetch } from './authFetch'

const BASE = '/api'

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body && typeof body.error === 'string') return body.error
  } catch {
    /* not JSON */
  }
  return res.statusText || `HTTP ${res.status}`
}

/**
 * Ruleset + starting layout for a new game (both optional, default "Classic"), plus who moves
 * first (optional, defaults to P1) — used for a rematch that swaps the starting player.
 *
 * `timeControl` is room-only (see `createRoom`) — the preset name for a chess-clock-style
 * time control (see `game/timeControls.ts` for the fixed catalog of names), or omitted for an
 * untimed room. `createGame` (local/solo play) never sends it: local play stays clockless, and
 * the backend's `CreateGameRequest` has no such field.
 */
export interface NewGameOptions {
  ruleset?: string
  layout?: string
  firstPlayer?: Player
  timeControl?: string
}

export async function createGame(options: NewGameOptions = {}): Promise<GameResponse> {
  const res = await authFetch(`${BASE}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

export async function getGame(id: string): Promise<GameResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(id)}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

/** Newest-first list of every game, for the archive view. No board state, no pagination. */
export async function listGames(): Promise<GameSummary[]> {
  const res = await authFetch(`${BASE}/games`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameSummary[]
}

/** Same shape as `listGames`, filtered to games the logged-in account played. Requires auth. */
export async function listMyGames(): Promise<GameSummary[]> {
  const res = await authFetch(`${BASE}/games?mine=true`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameSummary[]
}

/** The starting board plus the full move history (oldest first) — for the replay screen. */
export async function getGameMoves(id: string): Promise<GameHistoryResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(id)}/moves`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameHistoryResponse
}

export async function createRoom(options: NewGameOptions = {}): Promise<RoomResponse> {
  const res = await authFetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as RoomResponse
}

export async function joinRoom(code: string): Promise<RoomResponse> {
  const res = await authFetch(`${BASE}/rooms/${encodeURIComponent(code)}/join`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as RoomResponse
}

export interface ClaimSeatResponse {
  gameId: string
  seat: Seat
  claimed: boolean
}

/**
 * Retroactively attaches the logged-in account to a seat in a room game it was already playing
 * anonymously, so it shows up in that account's archive/`mine=true` list. Never rates the game
 * after the fact — rated-eligibility is decided once, at seat-fill time. Room games only.
 */
export async function claimSeat(gameId: string, seat: Player): Promise<ClaimSeatResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/claim-seat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seat }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as ClaimSeatResponse
}

export interface ClaimTimeoutResponse {
  gameId: string
  status: GameStatus
  endReason: EndReason
  serverNowUtc: string
}

/**
 * Tells the server to authoritatively recheck whether the current mover's clock has actually
 * expired and, if so, finish the game (opponent wins, `EndReason = "Timeout"`). Called by
 * `GameClock`'s local tick the instant it observes zero — a 409 (not actually expired yet, or
 * another client/the server's own broadcast already resolved it) is expected and benign; the
 * authoritative outcome always arrives via the `gameEnded` hub push (or the next resync), not
 * this call's return value, so callers can safely ignore both success and failure here.
 */
export async function claimTimeout(gameId: string): Promise<ClaimTimeoutResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/claim-timeout`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as ClaimTimeoutResponse
}

/** A move can legitimately fail (400 illegal, 409 finished); callers handle both branches. */
export type SubmitMoveResult =
  | { ok: true; data: SubmitMoveResponse }
  | { ok: false; status: number; error: string }

export async function submitMove(
  id: string,
  move: MoveRequest,
  seat?: Seat,
): Promise<SubmitMoveResult> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(id)}/moves`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(seat ? { ...move, seat } : move),
  })
  if (res.ok) return { ok: true, data: (await res.json()) as SubmitMoveResponse }
  return { ok: false, status: res.status, error: await readError(res) }
}
