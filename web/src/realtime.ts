import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import type { IRetryPolicy, RetryContext } from '@microsoft/signalr'
import type {
  GameEndedEvent,
  OpponentDisconnectedEvent,
  OpponentJoinedEvent,
  OpponentReconnectedEvent,
  RematchDeclinedEvent,
  RematchOfferedEvent,
  RematchReadyEvent,
  RoomResponse,
  Seat,
  SubmitMoveResponse,
} from './api/types'
import { useAuth } from './authStore'
import { pushRingEntry } from './diagnostics'

/**
 * One hub connection to `/api/hub` — no longer scoped to "following the current game" only
 * (see `backlog/07-friend-invites-matches.md`). The connection now serves two independent
 * purposes on the same socket:
 *
 *  1. **Following a game** (unchanged): `followGame`/`unfollow` register the per-game handlers
 *     (`moveApplied`, `gameEnded`, `opponentDisconnected`, `opponentReconnected`,
 *     `opponentJoined`, `rematchOffered`, `rematchReady`, `rematchDeclined`) and `Join` the game's
 *     group. These are broadcasts of decisions a controller already committed, never independent
 *     state — the rematch trio rides this same per-game group (both seats are already in it),
 *     unlike the per-user invite events below, since a rematch offer only ever matters to the
 *     specific opponent already sharing this game.
 *  2. **Per-user invite/friend-request delivery** (new): any authenticated client calls
 *     `SubscribeToUser` once per connect/reconnect (guests skip it — an authenticated-only
 *     feature) to join the `user:{userId}` group and receive pushes from anywhere in the app,
 *     independent of whether a game is being followed: `inviteReceived` (minimal — just enough to
 *     trigger a `GET /api/invites/pending` refetch, never trusted as content on its own),
 *     `inviteAccepted` (pushed to the *inviter* when the invitee accepts — this one DOES carry
 *     content, a `RoomResponse`-shaped `{ gameId, code, seat }`, since there's no REST list to
 *     re-fetch that would tell the inviter which room to enter), and `friendRequestReceived`
 *     (same minimal discipline as `inviteReceived`, refetches `GET /api/friends/requests/incoming`).
 *
 * The connection itself is a **persistent singleton once started**: `unfollow()` (called when
 * leaving/switching games) only clears the game-following state, it does NOT stop the socket —
 * stopping it would drop the invite subscription for a user who's simply not in a game right
 * now (browsing `/friends`, `/archive`, etc). Only `disconnect()` does a real teardown, used by
 * `reconnectRealtime()` when the auth identity itself changes (login/logout), since
 * `accessTokenFactory` is only re-read at connect time.
 *
 * A failed connect (or a dropped connection) leaves the REST game fully playable and the
 * pending-invites list still reachable via its own `GET /api/invites/pending` fallback poll —
 * don't add client logic that only works when the hub is up.
 */

type MoveHandler = (data: SubmitMoveResponse) => void
type GameEndedHandler = (data: GameEndedEvent) => void
type ReconnectHandler = () => void
type OpponentDisconnectedHandler = (data: OpponentDisconnectedEvent) => void
type OpponentReconnectedHandler = (data: OpponentReconnectedEvent) => void
type OpponentJoinedHandler = (data: OpponentJoinedEvent) => void
type RematchOfferedHandler = (data: RematchOfferedEvent) => void
type RematchReadyHandler = (data: RematchReadyEvent) => void
type RematchDeclinedHandler = (data: RematchDeclinedEvent) => void
type InviteReceivedHandler = () => void
type InviteAcceptedHandler = (room: RoomResponse) => void
type FriendRequestReceivedHandler = () => void

interface GameHandlers {
  hubSeat: Seat | null
  onMove: MoveHandler
  onReconnected: ReconnectHandler
  onGameEnded: GameEndedHandler
  onOpponentDisconnected: OpponentDisconnectedHandler
  onOpponentReconnected: OpponentReconnectedHandler
  onOpponentJoined: OpponentJoinedHandler
  onRematchOffered: RematchOfferedHandler
  onRematchReady: RematchReadyHandler
  onRematchDeclined: RematchDeclinedHandler
}

/**
 * Retry forever, densely at first, because the server's abandonment claim is on a clock.
 *
 * `AbandonmentGraceSeconds = 45` (`api/Services/GameService.Endings.cs`) is how long after a
 * disconnect an opponent's claim against this client is accepted, and a successful `Join` clears
 * the server's disconnect timestamp — so **reconnecting inside that window is what defuses the
 * claim**, and how often we retry inside it decides whether a brief outage costs the game.
 * `withAutomaticReconnect()`'s own default (`[0, 2s, 10s, 30s]`, then stop forever) got both
 * halves wrong: only 4 attempts land inside the grace window, and giving up is permanent — a
 * player whose network returns at 50s could never walk back into a game nobody had claimed yet.
 *
 * So: one instant attempt (a dropped WebSocket that reconnects immediately is the common case),
 * then every 3s through a window comfortably past the 45s grace, then every 30s indefinitely. The
 * dense phase is ~20 negotiate attempts, which is cheap and bounded to the window that matters;
 * the indefinite tail is what makes "came back after lunch" work at all. Exported for the unit
 * test — `withAutomaticReconnect` is mocked away in `realtime.test.ts`, so the policy has to be
 * asserted on directly.
 *
 * If you shorten the dense window or make the tail finite again, re-read `GOTCHAS.md`'s entry on
 * this first: the constant below is coupled to a server-side product decision, not a local taste.
 */
const HUB_DENSE_RETRY_WINDOW_MS = 60_000
const HUB_DENSE_RETRY_MS = 3_000
const HUB_IDLE_RETRY_MS = 30_000

export const hubRetryPolicy: IRetryPolicy = {
  nextRetryDelayInMilliseconds({ previousRetryCount, elapsedMilliseconds }: RetryContext): number {
    if (previousRetryCount === 0) return 0
    return elapsedMilliseconds < HUB_DENSE_RETRY_WINDOW_MS ? HUB_DENSE_RETRY_MS : HUB_IDLE_RETRY_MS
  },
}

let connection: HubConnection | null = null
let connecting: Promise<HubConnection> | null = null
let followingGameId: string | null = null
let gameHandlers: GameHandlers | null = null
let inviteHandler: InviteReceivedHandler | null = null
let inviteAcceptedHandler: InviteAcceptedHandler | null = null
let friendRequestHandler: FriendRequestReceivedHandler | null = null

export function isConnected(): boolean {
  return connection?.state === HubConnectionState.Connected
}

/** The current connection's server-assigned id, or null if not connected — the second half-life
 *  correlation key for hub-only events with no HTTP request behind them (`Join`,
 *  `OnDisconnectedAsync`, etc), used by `BugReportDialog` to fill `ConnectionId` in the bundle. */
export function getConnectionId(): string | null {
  return connection?.connectionId ?? null
}

/** Whether this client should hold a `user:{userId}` subscription — guests can't receive
 *  friend invites at all, so there's nothing to subscribe them to. */
function isAuthenticated(): boolean {
  return !!useAuth.getState().accessToken
}

/** Joins the `user:{userId}` group server-side (the server reads the caller's id off the bearer
 *  token, never a client-supplied id) — a no-op for a guest connection. Called once right after
 *  connect and again after every automatic reconnect, since `withAutomaticReconnect` drops group
 *  membership server-side. Failure is swallowed the same way `Join` failures are: realtime is an
 *  enhancement, not a requirement. */
async function subscribeToUserIfAuthenticated(conn: HubConnection): Promise<void> {
  if (!isAuthenticated()) {
    console.log('[realtime] subscribeToUserIfAuthenticated: not authenticated, skipping SubscribeToUser')
    return
  }
  try {
    await conn.invoke('SubscribeToUser')
    console.log('[realtime] SubscribeToUser invoked ok, connectionId=', conn.connectionId)
  } catch (e) {
    console.log('[realtime] SubscribeToUser invoke failed', e)
    /* ignore — the pending-invites list still has its own REST fallback */
  }
}

/**
 * Everything a connection needs re-done once it's live, whether that's an automatic reconnect or
 * a freshly-built replacement for a dead singleton: rejoin the `user:{userId}` group, rejoin the
 * followed game's group, and let the store `resync()` catch up on whatever was missed while the
 * socket was down. Server-side group membership belongs to a *connection*, so none of it survives
 * either path — a rebuild that skipped this would look connected and silently receive nothing.
 *
 * The `followingGameId` guard is also what keeps this a no-op on a genuine first connect:
 * `followGame` sets `followingGameId` only *after* its own `Join` succeeds, so there's no
 * double-join race with it here.
 */
async function reestablishSubscriptions(conn: HubConnection): Promise<void> {
  await subscribeToUserIfAuthenticated(conn)
  if (followingGameId && gameHandlers) {
    try {
      await conn.invoke('Join', followingGameId, gameHandlers.hubSeat)
    } catch {
      /* ignore — same discipline as every other Join: realtime is an enhancement */
    }
    gameHandlers.onReconnected()
  }
}

/** Builds, starts, and returns the singleton connection — reused by both `followGame` and
 *  `subscribeToUserInvites`. Idempotent: concurrent callers share the same in-flight start.
 *
 *  A singleton that has reached `Disconnected` is discarded and rebuilt rather than handed back.
 *  Only that one state qualifies: `Connecting`/`Reconnecting` are reused on purpose, since
 *  rebuilding mid-reconnect would race `withAutomaticReconnect`'s own in-flight attempt and leave
 *  two sockets fighting over the same groups. */
async function ensureConnection(): Promise<HubConnection> {
  if (connection) {
    if (connection.state !== HubConnectionState.Disconnected) return connection
    // Dead singleton (see `onclose`) — fall through and build a fresh one.
    connection = null
  }
  if (connecting) return connecting

  const conn = new HubConnectionBuilder()
    .withUrl('/api/hub', { accessTokenFactory: () => useAuth.getState().accessToken ?? '' })
    .withAutomaticReconnect(hubRetryPolicy)
    .configureLogging(LogLevel.Warning)
    .build()

  conn.on('moveApplied', (data: SubmitMoveResponse) => {
    pushRingEntry({ kind: 'hub', label: 'moveApplied', detail: { moveNumber: data.moveNumber, traceId: data.traceId } })
    gameHandlers?.onMove(data)
  })
  conn.on('gameEnded', (data: GameEndedEvent) => {
    pushRingEntry({ kind: 'hub', label: 'gameEnded', detail: { status: data.status, endReason: data.endReason, traceId: data.traceId } })
    gameHandlers?.onGameEnded(data)
  })
  conn.on('opponentDisconnected', (data: OpponentDisconnectedEvent) => {
    pushRingEntry({ kind: 'hub', label: 'opponentDisconnected', detail: data })
    gameHandlers?.onOpponentDisconnected(data)
  })
  conn.on('opponentReconnected', (data: OpponentReconnectedEvent) => {
    pushRingEntry({ kind: 'hub', label: 'opponentReconnected', detail: data })
    gameHandlers?.onOpponentReconnected(data)
  })
  conn.on('opponentJoined', (data: OpponentJoinedEvent) => {
    pushRingEntry({ kind: 'hub', label: 'opponentJoined', detail: data })
    gameHandlers?.onOpponentJoined(data)
  })
  conn.on('rematchOffered', (data: RematchOfferedEvent) => {
    pushRingEntry({ kind: 'hub', label: 'rematchOffered', detail: data })
    gameHandlers?.onRematchOffered(data)
  })
  conn.on('rematchReady', (data: RematchReadyEvent) => {
    pushRingEntry({ kind: 'hub', label: 'rematchReady', detail: data })
    gameHandlers?.onRematchReady(data)
  })
  conn.on('rematchDeclined', (data: RematchDeclinedEvent) => {
    pushRingEntry({ kind: 'hub', label: 'rematchDeclined', detail: data })
    gameHandlers?.onRematchDeclined(data)
  })
  conn.on('inviteReceived', (data: unknown) => {
    console.log('[realtime] inviteReceived', data, 'handlerRegistered=', !!inviteHandler)
    pushRingEntry({ kind: 'hub', label: 'inviteReceived' })
    inviteHandler?.()
  })
  conn.on('inviteAccepted', (data: RoomResponse) => {
    console.log('[realtime] inviteAccepted', data, 'handlerRegistered=', !!inviteAcceptedHandler)
    pushRingEntry({ kind: 'hub', label: 'inviteAccepted', detail: data })
    inviteAcceptedHandler?.(data)
  })
  conn.on('friendRequestReceived', (data: unknown) => {
    console.log('[realtime] friendRequestReceived', data, 'handlerRegistered=', !!friendRequestHandler)
    pushRingEntry({ kind: 'hub', label: 'friendRequestReceived' })
    friendRequestHandler?.()
  })

  conn.onclose((err) => {
    console.log('[realtime] connection closed', err)
    pushRingEntry({ kind: 'hub', label: 'connection closed', detail: String(err ?? '') })
    // Forget a closed singleton so the next `ensureConnection()` rebuilds instead of handing back
    // a dead object forever. Guarded on identity: `disconnect()` nulls `connection` and *then*
    // calls `stop()`, so this fires after a replacement may already be in place — an unguarded
    // null here would wipe the new connection on the old one's way out.
    if (connection === conn) connection = null
  })
  conn.onreconnecting((err) => {
    console.log('[realtime] reconnecting', err)
    pushRingEntry({ kind: 'hub', label: 'reconnecting', detail: String(err ?? '') })
  })

  conn.onreconnected(() => {
    pushRingEntry({ kind: 'hub', label: 'reconnected', detail: { connectionId: conn.connectionId } })
    void reestablishSubscriptions(conn)
  })

  connecting = (async () => {
    try {
      await conn.start()
      console.log('[realtime] connection started, connectionId=', conn.connectionId, 'state=', conn.state)
      pushRingEntry({ kind: 'hub', label: 'connection started', detail: { connectionId: conn.connectionId } })
      // Set before re-subscribing so `onclose`'s identity guard can recognise this connection if
      // the socket dies during the invokes below.
      connection = conn
      await reestablishSubscriptions(conn)
      return conn
    } catch (e) {
      console.log('[realtime] connection start failed', e)
      pushRingEntry({ kind: 'hub', label: 'connection start failed', detail: String(e) })
      try {
        await conn.stop()
      } catch {
        /* ignore */
      }
      throw e
    } finally {
      connecting = null
    }
  })()

  return connecting
}

/**
 * Connect (or reuse the existing connection) and join the given game's group. `seat` is the
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
  onRematchOffered: RematchOfferedHandler,
  onRematchReady: RematchReadyHandler,
  onRematchDeclined: RematchDeclinedHandler,
): Promise<void> {
  if (followingGameId === gameId) return

  const hubSeat = seat === 'P1' || seat === 'P2' ? seat : null
  gameHandlers = {
    hubSeat,
    onMove,
    onReconnected,
    onGameEnded,
    onOpponentDisconnected,
    onOpponentReconnected,
    onOpponentJoined,
    onRematchOffered,
    onRematchReady,
    onRematchDeclined,
  }

  try {
    const conn = await ensureConnection()
    await conn.invoke('Join', gameId, hubSeat)
    followingGameId = gameId
  } catch {
    // Realtime is an enhancement — a failed connect/join leaves the REST game fully playable.
    followingGameId = null
    gameHandlers = null
  }
}

/** Stops following the current game. Deliberately does NOT stop the connection itself — an
 *  authenticated user browsing away from a game still needs the socket for `inviteReceived`.
 *  Use `disconnect()` for a real teardown (identity change). */
export async function unfollow(): Promise<void> {
  followingGameId = null
  gameHandlers = null
}

/** Registers the handler fired on `inviteReceived` and ensures the connection is up (with a
 *  `SubscribeToUser` call once connected) for the current auth identity. A no-op call for a
 *  guest still connects nothing extra — `subscribeToUserIfAuthenticated` skips the invoke, and a
 *  guest has no `followGame` reason to hold a connection open either. Safe to call repeatedly
 *  (e.g. on every render of the always-mounted pending-invites surface); pass `null` to clear
 *  the handler. */
export async function subscribeToUserInvites(onInviteReceived: InviteReceivedHandler | null): Promise<void> {
  inviteHandler = onInviteReceived
  if (!onInviteReceived || !isAuthenticated()) return
  try {
    await ensureConnection()
  } catch {
    /* ignore — the pending-invites list still has its own REST fallback */
  }
}

/** Registers the handler fired on `inviteAccepted` — pushed to the *inviter* (never the invitee,
 *  who gets its own `RoomResponse` back over REST) when the other side accepts, carrying the
 *  inviter's own `{ gameId, code, seat }` to enter the room the same way `PendingInvitesTray`'s
 *  own accept flow does. Same connect/no-op-for-guests shape as `subscribeToUserInvites`; pass
 *  `null` to clear the handler. */
export async function subscribeToInviteAccepted(onInviteAccepted: InviteAcceptedHandler | null): Promise<void> {
  inviteAcceptedHandler = onInviteAccepted
  console.log('[realtime] subscribeToInviteAccepted called, handler=', !!onInviteAccepted, 'authenticated=', isAuthenticated())
  if (!onInviteAccepted || !isAuthenticated()) return
  try {
    const conn = await ensureConnection()
    console.log('[realtime] subscribeToInviteAccepted: connection ready, state=', conn.state)
  } catch (e) {
    console.log('[realtime] subscribeToInviteAccepted: ensureConnection failed', e)
    /* ignore — a missed push just leaves the inviter on the waiting screen until they refresh */
  }
}

/** Registers the handler fired on `friendRequestReceived` (pushed by `FriendsController.CreateRequest`
 *  to the addressee's `user:{id}` group). Same minimal-payload, re-fetch-on-push discipline as every
 *  other hub event here — the push itself carries nothing, callers re-fetch
 *  `GET /api/friends/requests/incoming`. Same connect shape as `subscribeToUserInvites`; pass `null`
 *  to clear the handler. */
export async function subscribeToFriendRequests(onFriendRequestReceived: FriendRequestReceivedHandler | null): Promise<void> {
  friendRequestHandler = onFriendRequestReceived
  if (!onFriendRequestReceived || !isAuthenticated()) return
  try {
    await ensureConnection()
  } catch {
    /* ignore — the incoming-requests list still has its own REST fallback */
  }
}

/**
 * Catch-up for the app coming back to the foreground or the network coming back. `AppLayout`
 * calls this via the store's `resumeFromBackground`. A backgrounded phone suspends the page, and
 * the WebSocket can die underneath it. SignalR only notices when its server-timeout or next retry
 * timer fires, and those timers were frozen along with everything else. So without this, a player
 * reopening the app can see a stale board, and no pushes arrive, for up to ~30s.
 *
 * - Re-fetches the per-user lists a missed push would have refreshed (pending invites, incoming
 *   friend requests). The store re-fetches the game itself, since REST is the source of truth.
 * - If the singleton is gone or dead and something still wants it, rebuilds it now. The rebuild
 *   re-joins its groups via `reestablishSubscriptions`. A `Connecting`/`Reconnecting` connection
 *   is left alone for the same reason `ensureConnection` reuses one. Stopping it to reconnect
 *   sooner would drop `withAutomaticReconnect`'s retry-forever guarantee if the fresh `start()`
 *   then failed, and a fresh start that fails never retries on its own.
 */
export async function resumeRealtime(): Promise<void> {
  inviteHandler?.()
  friendRequestHandler?.()

  const alive = connection !== null && connection.state !== HubConnectionState.Disconnected
  const wanted = followingGameId !== null || !!inviteHandler || !!inviteAcceptedHandler || !!friendRequestHandler
  if (alive || connecting || !wanted || !isAuthenticated()) return
  try {
    await ensureConnection()
  } catch {
    /* ignore — the REST catch-up already ran; the next resume or subscriber tries again */
  }
}

/** Full teardown — stops and forgets the connection. Used when the auth identity itself changes
 *  (login/logout mid-session), since `accessTokenFactory` is only re-read at connect time; a
 *  fresh connection is what actually picks up the new (or absent) token. */
export async function disconnect(): Promise<void> {
  const conn = connection
  connection = null
  followingGameId = null
  gameHandlers = null
  if (conn) {
    try {
      await conn.stop()
    } catch {
      /* ignore */
    }
  }
}
