import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import type { SubmitMoveResponse } from './api/types'

/**
 * One hub connection to `/api/hub`, following the current game. The REST endpoint stays the
 * source of truth; this only delivers the `moveApplied` broadcast that a move produced —
 * whoever made it — so every client in the room animates it.
 */

type MoveHandler = (data: SubmitMoveResponse) => void
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
): Promise<void> {
  if (connection && followingGameId === gameId) return
  await unfollow()

  const conn = new HubConnectionBuilder()
    .withUrl('/api/hub')
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  conn.on('moveApplied', (data: SubmitMoveResponse) => onMove(data))
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
