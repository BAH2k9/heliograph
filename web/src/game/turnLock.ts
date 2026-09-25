import type { GameStatus, Player, Seat } from '../api/types'
import { SIDE_NAMES } from './displayNames'

export type { Seat }

/** Whether the holder of `seat` may act right now. Solo play (no seat) can always act, except on
 *  a bot's own turn (`botSeat`, see `backlog/08-bot-opponent.md`) — the bot moves itself, server
 *  side, so the human never gets to act on its behalf regardless of seat. */
export function canAct(seat: Seat | null, turn: Player, status: GameStatus, botSeat: Player | null = null): boolean {
  if (status !== 'InProgress') return false
  if (turn === botSeat) return false
  if (seat === null) return true
  return seat === turn
}

/** Whether an active game should block starting a different one (Local Play / Play Bot /
 *  Challenge a Friend) and drives the persistent active-game banner. True for any in-progress
 *  game — a seated room game, a local hotseat game, or a bot game alike, not just a seated room
 *  game — since resignation is now the only way to end a game early (there's no more "Leave" to
 *  silently abandon one). False once the game is over — a lingering game the player hasn't
 *  started a rematch from yet shouldn't itself block a new one, the same way `playAgain` already
 *  moves on without requiring a separate click. Also false for a `Spectator` seat: a spectator has
 *  nothing to resign, so treating them as "active" here (with no "Leave" left to fall back on)
 *  would trap them behind the nav-block with no way out until the game they're merely watching
 *  happens to end. */
export function hasActiveGame(gameId: string | null, status: GameStatus, seat: Seat | null = null): boolean {
  return gameId !== null && status === 'InProgress' && seat !== 'Spectator'
}

/** One-line status for a seated player; empty string for solo play. */
export function seatStatus(seat: Seat | null, turn: Player, status: GameStatus): string {
  if (seat === null) return ''
  if (status !== 'InProgress') return 'Game over'
  if (seat === 'Spectator') return `Spectating — ${SIDE_NAMES[turn]} to move`
  return seat === turn ? 'Your turn' : 'Waiting for opponent'
}
