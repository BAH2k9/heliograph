import type {
  BotDifficulty,
  EndReason,
  GameEndedEvent,
  GameHistoryResponse,
  GameResponse,
  GameStatus,
  GameSummary,
  MoveRequest,
  Player,
  PublicPlayerProfile,
  RoomResponse,
  Seat,
  SubmitMoveResponse,
} from './types'
import type {
  FriendRequestSummary,
  FriendSummary,
  MatchInviteResponse,
  PendingInvite,
  SendFriendRequestResponse,
  SentInvite,
  UserSearchResult,
} from './authTypes'
import { authFetch } from './authFetch'

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

export async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body && typeof body.error === 'string') return body.error
  } catch {
    /* not JSON */
  }
  return res.statusText || `HTTP ${res.status}`
}

/**
 * Ruleset + starting layout for a new game (both optional, default "Classic"), plus who moves
 * first (optional, defaults to P1) — used for a rematch that swaps the starting player.
 *
 * `timeControl` is room-only (see `createRoom`) — the preset name for a chess-clock-style
 * time control (see `game/timeControls.ts` for the fixed catalog of names), or omitted for an
 * untimed room. `createGame` (local/solo play) never sends it: local play stays clockless, and
 * the backend's `CreateGameRequest` has no such field.
 */
export interface NewGameOptions {
  ruleset?: string
  layout?: string
  firstPlayer?: Player
  timeControl?: string
}

export async function createGame(options: NewGameOptions = {}): Promise<GameResponse> {
  const res = await authFetch(`${BASE}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

/**
 * `POST /api/games/bot` — creates a solo game against the server-side bot (see
 * `backlog/08-bot-opponent.md`). `playerSeat` defaults to `"P1"` server-side when omitted; if the
 * bot ends up as `"P1"`, the response already reflects the bot's opening move (no extra request
 * needed). No auth required — bot games are always unrated/anonymous, same as `createGame`.
 */
export interface CreateBotGameOptions {
  difficulty: BotDifficulty
  ruleset?: string
  layout?: string
  playerSeat?: Player
}

export async function createBotGame(options: CreateBotGameOptions): Promise<GameResponse> {
  const res = await authFetch(`${BASE}/games/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

export async function getGame(id: string): Promise<GameResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(id)}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameResponse
}

/** Newest-first list of every game, for the archive view. No board state, no pagination. */
export async function listGames(): Promise<GameSummary[]> {
  const res = await authFetch(`${BASE}/games`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameSummary[]
}

/** Same shape as `listGames`, filtered to games the logged-in account played. Requires auth. */
export async function listMyGames(): Promise<GameSummary[]> {
  const res = await authFetch(`${BASE}/games?mine=true`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameSummary[]
}

/** The starting board plus the full move history (oldest first) — for the replay screen. */
export async function getGameMoves(id: string): Promise<GameHistoryResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(id)}/moves`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as GameHistoryResponse
}

/** Trimmed public profile for one claimed seat — the in-game player-info popup's real-opponent
 *  fetch. Only call this for a seat known to be claimed by a real account (not bot/hotseat) —
 *  see `PlayScreen`'s `playerCard`. */
export async function getPlayerProfile(gameId: string, seat: Player): Promise<PublicPlayerProfile> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(seat)}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as PublicPlayerProfile
}

export async function createRoom(options: NewGameOptions = {}): Promise<RoomResponse> {
  const res = await authFetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as RoomResponse
}

export interface ClaimTimeoutResponse {
  gameId: string
  status: GameStatus
  endReason: EndReason
  serverNowUtc: string
}

/**
 * Tells the server to authoritatively recheck whether the current mover's clock has actually
 * expired and, if so, finish the game (opponent wins, `EndReason = "Timeout"`). Called by
 * `GameClock`'s local tick the instant it observes zero — a 409 (not actually expired yet, or
 * another client/the server's own broadcast already resolved it) is expected and benign; the
 * authoritative outcome always arrives via the `gameEnded` hub push (or the next resync), not
 * this call's return value, so callers can safely ignore both success and failure here.
 */
export async function claimTimeout(gameId: string): Promise<ClaimTimeoutResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/claim-timeout`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as ClaimTimeoutResponse
}

export interface ClaimAbandonmentResponse {
  gameId: string
  status: GameStatus
  endReason: EndReason
  serverNowUtc: string
}

/**
 * Tells the server to authoritatively recheck whether the *other* seat's tracked disconnect has
 * been outstanding for at least the 45s grace window and, if so, finish the game (this seat
 * wins, `EndReason = "Abandonment"`). `seat` is the caller's own seat ("my opponent abandoned, I
 * win") — never the disconnected seat itself; the server looks up the other one. Mirrors
 * `claimTimeout`: a 409 (not disconnected, not long enough, or already finished) is expected and
 * benign — the authoritative outcome always arrives via the `gameEnded` hub push (or the next
 * resync), not this call's return value.
 */
export async function claimAbandonment(gameId: string, seat: Player): Promise<ClaimAbandonmentResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/claim-abandonment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seat }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as ClaimAbandonmentResponse
}

/** Response of `POST /api/games/{id}/resign` — same shape as `ClaimTimeoutResponse` (the other
 *  "authoritatively end the game" endpoint); `endReason` is always `"Resignation"` here. */
export type ResignResponse = ClaimTimeoutResponse

/**
 * Concedes on behalf of `seat` (the *other* seat wins, `EndReason = "Resignation"`). Same
 * fire-and-forget shape as `claimTimeout`: the authoritative outcome always arrives via the
 * `gameEnded` hub push (or the next resync), not this call's return value, so a caller can let
 * a benign failure (already-finished race, network blip) pass silently.
 */
export async function resignGame(gameId: string, seat: 'P1' | 'P2'): Promise<ResignResponse> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/resign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seat }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as ResignResponse
}

/**
 * "I want a rematch" — see `RoomService.RequestRematchAsync`'s doc comment for the propose/match
 * shape: no separate accept step, since the other seat's own call to this same endpoint (whether
 * from its own "Play again" button or an "Accept" click on the offer banner) is what completes
 * the match. `matched: false` (202, no room yet) means still waiting on the other seat — the
 * authoritative outcome then arrives via the `rematchReady` hub push, or the next `getGame` poll
 * reading `rematchGameId`, same "don't trust this call's own return" discipline as `claimTimeout`.
 * `matched: true` (200) carries the caller's own seat in the new room directly.
 */
export type RematchRequestResult = { matched: false } | { matched: true; room: RoomResponse }

export async function requestRematch(gameId: string, seat: 'P1' | 'P2'): Promise<RematchRequestResult> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/rematch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seat }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  if (res.status === 202) return { matched: false }
  return { matched: true, room: (await res.json()) as RoomResponse }
}

/** Withdraws a pending rematch request — resets both seats' pending requests server-side (see
 *  `RoomService.DeclineRematchAsync`), not just the decliner's. Fire-and-forget shape, same as
 *  `resignGame`'s sibling claim-style calls: a benign failure just leaves the banner up. */
export async function declineRematch(gameId: string, seat: 'P1' | 'P2'): Promise<void> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(gameId)}/rematch/decline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seat }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
}

/**
 * A move can legitimately fail (400 illegal, 409 finished); callers handle both branches. A 409
 * for a move that arrived after the mover's clock had already expired is a superset of the
 * plain `{ error }` shape every other 4xx uses — it also carries `status`/`endReason`/
 * `serverNowUtc` (the game ended as a side effect of the rejected submission, same shape as a
 * `gameEnded` hub push), surfaced here as `timeout` so a clock-aware caller can apply that
 * outcome directly instead of a follow-up GET/resync. Absent for every other 409/400 reason
 * (illegal move, already-finished for a non-clock reason, etc).
 */
export type SubmitMoveResult =
  | { ok: true; data: SubmitMoveResponse }
  | { ok: false; status: number; error: string; timeout?: GameEndedEvent }

async function readMoveError(res: Response): Promise<{ error: string; timeout?: GameEndedEvent }> {
  try {
    const body = (await res.json()) as {
      error?: string
      status?: GameStatus
      endReason?: EndReason
      serverNowUtc?: string
      traceId?: string | null
    }
    const error = typeof body?.error === 'string' ? body.error : res.statusText || `HTTP ${res.status}`
    if (body?.status && body?.endReason && body?.serverNowUtc) {
      return {
        error,
        timeout: {
          status: body.status,
          endReason: body.endReason,
          serverNowUtc: body.serverNowUtc,
          traceId: body.traceId ?? null,
        },
      }
    }
    return { error }
  } catch {
    return { error: res.statusText || `HTTP ${res.status}` }
  }
}

export async function submitMove(
  id: string,
  move: MoveRequest,
  seat?: Seat,
): Promise<SubmitMoveResult> {
  const res = await authFetch(`${BASE}/games/${encodeURIComponent(id)}/moves`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(seat ? { ...move, seat } : move),
  })
  if (res.ok) return { ok: true, data: (await res.json()) as SubmitMoveResponse }
  const { error, timeout } = await readMoveError(res)
  return { ok: false, status: res.status, error, timeout }
}

// --- Friends (backlog/06-friend-invites-friendships.md) ---------------------------------------

/** `GET /api/users/search?q=` — case-insensitive `DisplayName` contains-match, excludes the
 *  caller, capped at 20 hits server-side. Callers debounce; the backend has no rate limit of
 *  its own beyond what's already standard (friends/family scale, not general discovery). */
export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const res = await authFetch(`${BASE}/users/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as UserSearchResult[]
}

/**
 * Sends a friend request. A 409 (already friends, or a request already pending in the same
 * direction) is a normal, expected outcome the caller should surface inline rather than treat as
 * a hard failure — the "Add friend" button becomes unavailable once a search result is already a
 * friend/pending, so this mainly guards a stale search-results list. `status: "accepted"` means
 * the reverse request was already pending and this call implicit-accepted it instead of creating
 * a new row (see the wire contract's "Owner decisions already made").
 */
export async function sendFriendRequest(addresseeId: string): Promise<SendFriendRequestResponse> {
  const res = await authFetch(`${BASE}/friends/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ addresseeId }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as SendFriendRequestResponse
}

/** Accepts an incoming request the caller is the addressee on. Returns the new friendship row. */
export async function acceptFriendRequest(requestId: string): Promise<FriendSummary> {
  const res = await authFetch(`${BASE}/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as FriendSummary
}

/** Declines an incoming request (deletes it — a decline is never stored as a status). */
export async function declineFriendRequest(requestId: string): Promise<void> {
  const res = await authFetch(`${BASE}/friends/requests/${encodeURIComponent(requestId)}/decline`, {
    method: 'POST',
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
}

/** Idempotent unfriend — 204 whether or not the friendship existed. */
export async function removeFriend(friendUserId: string): Promise<void> {
  const res = await authFetch(`${BASE}/friends/${encodeURIComponent(friendUserId)}`, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
}

/** Accepted friendships for the logged-in account. */
export async function listFriends(): Promise<FriendSummary[]> {
  const res = await authFetch(`${BASE}/friends`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as FriendSummary[]
}

/** Pending requests where the caller is the addressee (can accept/decline). */
export async function listIncomingRequests(): Promise<FriendRequestSummary[]> {
  const res = await authFetch(`${BASE}/friends/requests/incoming`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as FriendRequestSummary[]
}

/** Pending requests where the caller is the requester (no action, just "pending"). */
export async function listOutgoingRequests(): Promise<FriendRequestSummary[]> {
  const res = await authFetch(`${BASE}/friends/requests/outgoing`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as FriendRequestSummary[]
}

// --- Match invites (backlog/07-friend-invites-matches.md) --------------------------------------

/** Options for `POST /api/invites` — ruleset/layout default the same way `NewGameOptions` does;
 *  `rated` has no fixed default (the inviter chooses per invite, per the plan's owner decision). */
export interface SendInviteOptions {
  inviteeUserId: string
  ruleset?: string
  layout?: string
  timeControl?: string
  rated: boolean
}

/** Sends a match invite to an accepted friend. 400 if `inviteeUserId` isn't a friend, or a
 *  ruleset/layout/time-control name is unknown. On success, the backend pushes `inviteReceived`
 *  to the invitee over the hub — this call itself only creates the pending row. */
export async function sendInvite(options: SendInviteOptions): Promise<MatchInviteResponse> {
  const res = await authFetch(`${BASE}/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as MatchInviteResponse
}

/**
 * Accepts a pending invite — the caller must be the invitee. 404 if not found/not pending, 410
 * if the server's own clock finds it past `expiresAtUtc` (the claim pattern: never trust that
 * this is only called while the invite still looks live). On success, returns the same
 * `RoomResponse` shape `createRoom` does, so callers can reuse the existing "you're in this room
 * now" handling (`store.ts`'s `loadInto`).
 */
export async function acceptInvite(inviteId: string): Promise<RoomResponse> {
  const res = await authFetch(`${BASE}/invites/${encodeURIComponent(inviteId)}/accept`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as RoomResponse
}

/** Declines a pending invite — same auth shape as accept. 204, idempotent-ish (a stale/expired
 *  invite still 404s the same as accept would). */
export async function declineInvite(inviteId: string): Promise<void> {
  const res = await authFetch(`${BASE}/invites/${encodeURIComponent(inviteId)}/decline`, { method: 'POST' })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
}

/** Pending invites addressed to the caller, not yet past `expiresAtUtc`. This is the fallback
 *  list a client reconciles against on load and after an `inviteReceived` hub push — the push
 *  payload itself is never trusted as authoritative content. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const res = await authFetch(`${BASE}/invites/pending`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as PendingInvite[]
}

/** The caller's own not-yet-consumed sent invites (pending or already accepted) — polled by the
 *  "waiting for them to accept" screen as a fallback for a missed `inviteAccepted` push (see
 *  `SentInvite`'s doc comment for why the push alone isn't enough). */
export async function listSentInvites(): Promise<SentInvite[]> {
  const res = await authFetch(`${BASE}/invites/sent`)
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as SentInvite[]
}
