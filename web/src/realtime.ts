import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import type { GameEndedEvent, SubmitMoveResponse } from './api/types'
import { useAuth } from './authStore'

/**
 * One hub connection to `/api/hub`, following the current game. The REST endpoint stays the
 * source of truth; this only delivers the `moveApplied` broadcast that a move produced —
 * whoever made it — plus `gameEnded`, fired when a timeout ends the game (a deliberately
 * separate event, not an overload of `moveApplied` — see `api/types.ts`'s `GameEndedEvent` doc).
 *
 * `accessTokenFactory` is read live from the auth store on every connect/reconnect (not
 * captured once at build time), so a token obtained after this connection was first opened —
 * logging in mid-game, or a refresh — reaches the next reconnect. Guest play sends `''`, which
 * @microsoft/signalr treats as no token.
 */

type MoveHandler = (data: SubmitMoveResponse) => void
type GameEndedHandler = (data: GameEndedEvent) => void
type ReconnectHandler = () => void

let connection: HubConnection | null = null
let followingGameId: string | null = null

export function isConnected(): boolean {
  return connection?.state === HubConnectionState.Connected
}

/** Connect (or re-target an existing connection) and join the given game's group. */
export async function followGame(
  gameId: string,
  onMove: MoveHandler,
  onReconnected: ReconnectHandler,
  onGameEnded: GameEndedHandler,
): Promise<void> {
  if (connection && followingGameId === gameId) return
  await unfollow()

  const conn = new HubConnectionBuilder()
    .withUrl('/api/hub', { accessTokenFactory: () => useAuth.getState().accessToken ?? '' })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  conn.on('moveApplied', (data: SubmitMoveResponse) => onMove(data))
  conn.on('gameEnded', (data: GameEndedEvent) => onGameEnded(data))
  conn.onreconnected(() => {
    conn.invoke('Join', gameId).catch(() => {})
    onReconnected()
  })

  try {
    await conn.start()
    await conn.invoke('Join', gameId)
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
