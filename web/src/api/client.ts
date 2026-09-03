import type { GameResponse, MoveRequest, SubmitMoveResponse } from './types'

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

export async function createGame(): Promise<GameResponse> {
  const res = await fetch(`${BASE}/games`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

export async function getGame(id: string): Promise<GameResponse> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(id)}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

/** A move can legitimately fail (400 illegal, 409 finished); callers handle both branches. */
export type SubmitMoveResult =
  | { ok: true; data: SubmitMoveResponse }
  | { ok: false; status: number; error: string }

export async function submitMove(id: string, move: MoveRequest): Promise<SubmitMoveResult> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(id)}/moves`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(move),
  })
  if (res.ok) return { ok: true, data: (await res.json()) as SubmitMoveResponse }
  return { ok: false, status: res.status, error: await readError(res) }
}
