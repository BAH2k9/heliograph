import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import type {
  GameEndedEvent,
  OpponentDisconnectedEvent,
  OpponentJoinedEvent,
  OpponentReconnectedEvent,
  Seat,
  SubmitMoveResponse,
} from './api/types'
import { useAuth } from './authStore'

/**
 * One hub connection to `/api/hub`, following the current game. The REST endpoint stays the
 * source of truth; this only delivers the `moveApplied` broadcast that a move produced —
 * whoever made it — plus `gameEnded`, fired when a timeout ends the game (a deliberately
 * separate event, not an overload of `moveApplied` — see `api/types.ts`'s `GameEndedEvent` doc),
 * and `opponentDisconnected`/`opponentReconnected`, fired when a tracked seat's connection drops
 * or comes back mid-game (see `plans/02-disconnect-abandonment.md`'s wire contract), and
 * `opponentJoined`, fired to the rest of the group when a seat joins for the first time (the
 * second player entering a room) so they can resync and pick up the new player's profile.
 *
 * `accessTokenFactory` is read live from the auth store on every connect/reconnect (not
 * captured once at build time), so a token obtained after this connection was first opened —
 * logging in mid-game, or a refresh — reaches the next reconnect. Guest play sends `''`, which
 * @microsoft/signalr treats as no token.
 */

type MoveHandler = (data: SubmitMoveResponse) => void
type GameEndedHandler = (data: GameEndedEvent) => void
type ReconnectHandler = () => void
type OpponentDisconnectedHandler = (data: OpponentDisconnectedEvent) => void
type OpponentReconnectedHandler = (data: OpponentReconnectedEvent) => void
type OpponentJoinedHandler = (data: OpponentJoinedEvent) => void

let connection: HubConnection | null = null
let followingGameId: string | null = null

export function isConnected(): boolean {
  return connection?.state === HubConnectionState.Connected
}

/**
 * Connect (or re-target an existing connection) and join the given game's group. `seat` is the
 * local seat, if any (`"P1"`/`"P2"`; `null`/`"Spectator"` sent as no seat) — passed into every
 * `Join` invocation (initial and post-reconnect) so the server can track this connection against
 * that seat and clear its disconnect timestamp (the reconnect path).
 */
export async function followGame(
  gameId: string,
  seat: Seat | null,
  onMove: MoveHandler,
  onReconnected: ReconnectHandler,
  onGameEnded: GameEndedHandler,
  onOpponentDisconnected: OpponentDisconnectedHandler,
  onOpponentReconnected: OpponentReconnectedHandler,
  onOpponentJoined: OpponentJoinedHandler,
): Promise<void> {
  if (connection && followingGameId === gameId) return
  await unfollow()

  const hubSeat = seat === 'P1' || seat === 'P2' ? seat : null

  const conn = new HubConnectionBuilder()
    .withUrl('/api/hub', { accessTokenFactory: () => useAuth.getState().accessToken ?? '' })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  conn.on('moveApplied', (data: SubmitMoveResponse) => onMove(data))
  conn.on('gameEnded', (data: GameEndedEvent) => onGameEnded(data))
  conn.on('opponentDisconnected', (data: OpponentDisconnectedEvent) => onOpponentDisconnected(data))
  conn.on('opponentReconnected', (data: OpponentReconnectedEvent) => onOpponentReconnected(data))
  conn.on('opponentJoined', (data: OpponentJoinedEvent) => onOpponentJoined(data))
  conn.onreconnected(() => {
    conn.invoke('Join', gameId, hubSeat).catch(() => {})
    onReconnected()
  })

  try {
    await conn.start()
    await conn.invoke('Join', gameId, hubSeat)
    connection = conn
    followingGameId = gameId
  } catch {
    // Realtime is an enhancement — a failed connect leaves the REST game fully playable.
    try {
      await conn.stop()
    } catch {
      /* ignore */
    }
  }
}

export async function unfollow(): Promise<void> {
  const conn = connection
  connection = null
  followingGameId = null
  if (conn) {
    try {
      await conn.stop()
    } catch {
      /* ignore */
    }
  }
}
