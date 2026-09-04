import type { GameResponse, MoveRequest, RoomResponse, Seat, SubmitMoveResponse } from './types'

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

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body && typeof body.error === 'string') return body.error
  } catch {
    /* not JSON */
  }
  return res.statusText || `HTTP ${res.status}`
}

/** Ruleset + starting layout for a new game. Both optional; the server defaults each to "Classic". */
export interface NewGameOptions {
  ruleset?: string
  layout?: string
}

export async function createGame(options: NewGameOptions = {}): Promise<GameResponse> {
  const res = await fetch(`${BASE}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

export async function getGame(id: string): Promise<GameResponse> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(id)}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

export async function createRoom(options: NewGameOptions = {}): Promise<RoomResponse> {
  const res = await fetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as RoomResponse
}

export async function joinRoom(code: string): Promise<RoomResponse> {
  const res = await fetch(`${BASE}/rooms/${encodeURIComponent(code)}/join`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as RoomResponse
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
  const res = await fetch(`${BASE}/games/${encodeURIComponent(id)}/moves`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(seat ? { ...move, seat } : move),
  })
  if (res.ok) return { ok: true, data: (await res.json()) as SubmitMoveResponse }
  return { ok: false, status: res.status, error: await readError(res) }
}
