import type { GameStatus, Player, Seat } from '../api/types'

export type { Seat }

/** Whether the holder of `seat` may act right now. Solo play (no seat) can always act, except on
 *  a bot's own turn (`botSeat`, see `plans/08-bot-opponent.md`) — the bot moves itself, server
 *  side, so the human never gets to act on its behalf regardless of seat. */
export function canAct(seat: Seat | null, turn: Player, status: GameStatus, botSeat: Player | null = null): boolean {
  if (status !== 'InProgress') return false
  if (turn === botSeat) return false
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
