import type { GameStatus, Player, Seat } from '../api/types'

export type { Seat }

/** Whether the holder of `seat` may act right now. Solo play (no seat) can always act. */
export function canAct(seat: Seat | null, turn: Player, status: GameStatus): boolean {
  if (status !== 'InProgress') return false
  if (seat === null) return true
  return seat === turn
}

/** One-line status for a seated player; empty string for solo play. */
export function seatStatus(seat: Seat | null, turn: Player, status: GameStatus): string {
  if (seat === null) return ''
  if (status !== 'InProgress') return 'Game over'
  if (seat === 'Spectator') return `Spectating — ${turn} to move`
  return seat === turn ? 'Your turn' : 'Waiting for opponent'
}
