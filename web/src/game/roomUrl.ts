import type { Seat } from './turnLock'

/** The room-related query params the app round-trips through the URL so a refresh resumes. */
export interface RoomParams {
  gameId: string | null
  seat: Seat | null
  code: string | null
}

export function readRoomParams(search: string): RoomParams {
  const p = new URLSearchParams(search)
  const seat = p.get('seat')
  return {
    gameId: p.get('game'),
    seat: seat === 'P1' || seat === 'P2' || seat === 'Spectator' ? seat : null,
    code: p.get('code'),
  }
}

/** Writes (or clears) `game` / `seat` / `code` on `url`, returning it for chaining. */
export function applyRoomParams(url: URL, params: RoomParams): URL {
  const set = (key: string, value: string | null) =>
    value ? url.searchParams.set(key, value) : url.searchParams.delete(key)
  set('game', params.gameId)
  set('seat', params.seat)
  set('code', params.code)
  return url
}
