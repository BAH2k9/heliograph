import { create } from 'zustand'
import type {
  BotDifficulty,
  Coord,
  EndReason,
  GameEndedEvent,
  GameStatus,
  MoveRequest,
  OpponentDisconnectedEvent,
  OpponentReconnectedEvent,
  Player,
  PlayerSummary,
  RematchDeclinedEvent,
  RematchOfferedEvent,
  RematchReadyEvent,
  RoomResponse,
  RotationDir,
  Seat,
  SubmitMoveResponse,
} from './api/types'
import {
  claimAbandonment as apiClaimAbandonment,
  claimTimeout as apiClaimTimeout,
  createBotGame,
  type CreateBotGameOptions,
  createGame,
  createRoom as apiCreateRoom,
  declineRematch as apiDeclineRematch,
  getGame,
  listMyGames,
  requestRematch as apiRequestRematch,
  resignGame as apiResignGame,
  submitMove,
  type NewGameOptions,
} from './api/client'
import { pickLocalPlayerIdentities } from './components/localPlayerNames'
import {
  applyLaserResult,
  applyMove,
  identify,
  matchesServer,
  pieceAt,
  type ClientBoard,
} from './game/board'
import { inferMove } from './game/inferMove'
import { legalDestinations, legalStackTargets, unstackTargets as computeUnstackTargets } from './game/rules'
import { canAct } from './game/turnLock'
import { beamDurationMs, beamPoints, type Point } from './game/laser'
import { pushRingEntry } from './diagnostics'
import { disconnect, followGame, unfollow } from './realtime'
import { useDisplaySettings } from './settings/displaySettings'

/** The bullet currently travelling the board. `id` changes each fire to restart the animation. */
export interface Beam {
  points: Point[]
  id: number
}

interface GameStore {
  gameId: string | null
  board: ClientBoard | null
  turn: Player
  status: GameStatus
  moveCount: number

  /** Rule variant + starting layout the current game runs under (from the server). */
  ruleset: string
  layout: string

  /** The seat this client holds in a room, or null for solo play. */
  seat: Seat | null
  /** The shareable room code, or null for solo play. */
  roomCode: string | null
  /** True only for a Local Play (hotseat) game — set by `newGame`, `false` everywhere else
   *  (room/bot/loaded games). Both `PlayScreen` (show cards/resign for local play too) and
   *  `resign` (there's no single "my seat" in local play — see its own doc) key off this. */
  isLocal: boolean

  /** True only when both seats were filled by already-authenticated accounts at create/join. */
  rated: boolean
  /** Whether an account has claimed each seat. */
  p1Claimed: boolean
  p2Claimed: boolean

  /** Rendered identity + category rating for each seat, from `GameResponse.p1Profile`/
   *  `p2Profile` — null while that seat is anonymous/unclaimed. Snapped on every load/resync;
   *  unlike the clock fields, there's no hub push that updates this mid-game. Feeds `PlayerCard`
   *  in `PlayScreen`. */
  p1Profile: PlayerSummary | null
  p2Profile: PlayerSummary | null

  /** Chess-clock preset name for this room (see `game/timeControls.ts`), or null = untimed —
   *  always null for local/solo play, since the clock is multiplayer-room-only. */
  timeControl: string | null
  /** Banked remaining time in ms for each seat; null for an untimed room or a Daily game. */
  p1RemainingMs: number | null
  p2RemainingMs: number | null
  /** ISO 8601 — when the current mover's clock (or Daily's day-window) started. */
  turnStartedAtUtc: string | null
  /** ISO 8601 — forfeit-if-not-moved-by time; drives `GameClock`'s claim-timeout trigger. */
  turnDeadlineUtc: string | null
  /**
   * `serverNowUtc - Date.now()`, captured once per server payload (a move result, a fresh load,
   * a resync, or a `gameEnded` push). `GameClock`'s local tick computes `Date.now() +
   * serverOffsetMs` rather than ticking against the client's own (possibly skewed) clock — see
   * `api/types.ts`'s `GameResponse.serverNowUtc` doc for why this is load-bearing.
   */
  serverOffsetMs: number
  /** Mirrors `GameResponse.endReason`: null while the game is in progress, `"Pharaoh"` or
   *  `"Timeout"` once finished. Snapped on every load/resync (GET exposes it directly) and set
   *  immediately by a `gameEnded` push or a move-rejection 409's `timeout` field, both of which
   *  just avoid waiting for the next GET to learn the same answer. */
  endReason: EndReason | null

  /** Which seat the server plays as a bot, or null for a human-vs-human game (see
   *  `backlog/08-bot-opponent.md`). Fixed for the life of the game; snapped on every load/resync/
   *  create so a page refresh (`GET /api/games/{id}`) restores the same move-gating behavior.
   *  Gates `canAct` (the human can never act on the bot's own turn) and drives the "bot is
   *  thinking…" indicator (`turn === botSeat` while `status === 'InProgress'`). */
  botSeat: Player | null
  /** The bot's difficulty tier when `botSeat` is set, else null. Display-only today. */
  botDifficulty: BotDifficulty | null

  /**
   * ISO 8601 — set when that seat's connection was observed dropped mid-game (an
   * `opponentDisconnected` hub push), cleared by an `opponentReconnected` push or a fresh
   * load/resync (this client has no way to learn a live disconnect state except via the hub
   * push itself — `GameResponse` doesn't expose it). Mirrors the server's own
   * `P1DisconnectedAtUtc`/`P2DisconnectedAtUtc` columns; either seat can independently be
   * disconnected. Drives `DisconnectBanner`'s countdown toward a claimable `claimAbandonment()`.
   */
  p1DisconnectedAtUtc: string | null
  p2DisconnectedAtUtc: string | null

  /** True from the moment this seat's own `requestRematch()` call comes back "still waiting on
   *  the other seat" until either side resolves it (a match, or a decline) — drives the
   *  "waiting for opponent…" state on `PlayAgainButton`/`WinOverlay`'s button. Reset by
   *  `freshBoardState` like every other per-game field here. */
  rematchRequestedByMe: boolean
  /** True while the *other* seat has an unanswered rematch request pending against this game —
   *  drives `RematchOfferBanner`. Set by `applyRematchOffered` (only for the other seat's request,
   *  never an echo of this client's own), cleared by a match, a decline, or a fresh game load. */
  rematchOfferedByOpponent: boolean

  selected: Coord | null
  legalTargets: Coord[]
  /** Classic stacking: adjacent friendly single obelisks the selection may merge onto. */
  stackTargets: Coord[]
  /** Classic stacking: adjacent empty squares a selected two-high obelisk may drop onto. */
  unstackTargets: Coord[]
  /** While true, a click on an `unstackTargets` square unstacks instead of moving the stack. */
  unstackArmed: boolean

  /** A request is in flight or the move/laser/death animation is playing — input is locked. */
  busy: boolean
  error: string | null

  /** Non-null while the bullet is in flight. */
  beam: Beam | null
  /** Piece ids currently playing their destruction animation. */
  dying: string[]
  /** Set for the extra beat after a Pharaoh is destroyed, cleared once that beat ends — the cue
   *  for `Board` to render a distinct effect at the losing Pharaoh's square instead of (or on top
   *  of) the ordinary pop-and-vanish every other piece gets. */
  pharaohDown: { row: number; col: number; owner: Player } | null
  /**
   * False for the span between a game-ending move's `status` flip and the moment its animation
   * (slide → bullet → destroy → Pharaoh beat, if any) actually finishes; true otherwise. Exists so
   * `WinOverlay` doesn't pop up over a mid-animation board — see `playMoveResult`. Always true
   * outside of that window (fresh games, loaded/resynced games, timeout/resignation endings, which
   * have no move animation to wait for).
   */
  overlayReady: boolean
  /** True once `WinOverlay` has been dismissed (click-away / Escape / "View board") for the
   *  current game. Reset to false by every fresh game load (`freshBoardState`) so a new game's
   *  win pops the overlay again instead of staying silently dismissed. Lets `PlayScreen` swap
   *  `ResignButton` for a same-slot "Play again" button once the dialog is out of the way, rather
   *  than requiring the dialog be reopened to start a rematch. */
  overlayDismissed: boolean

  /** The full last `moveApplied` payload this client has seen (local submit or hub push), kept
   *  verbatim so `BugReportDialog`'s bundle can attach it without re-deriving it from summarized
   *  ring entries. Set in `applyRemoteMove`; null before any move has landed. See
   *  `backlog/10-bug-traceability.md`. */
  lastMoveApplied: SubmitMoveResponse | null

  newGame: (options?: NewGameOptions) => Promise<void>
  /** Starts a solo game against the server-side bot (`POST /api/games/bot`). Same shape as
   *  `newGame`, plus the required `difficulty` and an optional `playerSeat`. */
  newBotGame: (options: CreateBotGameOptions) => Promise<void>
  loadGame: (id: string, seat?: Seat | null) => Promise<void>
  createRoom: (options?: NewGameOptions) => Promise<void>
  /** Loads directly from an already-obtained `RoomResponse` — used after
   *  `POST /api/invites/{id}/accept`, which returns the same shape `RoomsController.Join` does
   *  but without a join-code round trip (`invites.ts`/`inviteStore.ts` calls this instead). There's
   *  no join-by-typed-code flow anymore — the "Join Game" nav entry is gone (guest play is gone;
   *  friend invites and shared links are the entry points now). */
  enterRoom: (room: RoomResponse) => Promise<void>
  selectSquare: (c: Coord) => void
  clearSelection: () => void
  moveTo: (to: Coord) => Promise<void>
  rotateSelected: (dir: RotationDir) => Promise<void>
  stackTo: (to: Coord) => Promise<void>
  unstackTo: (to: Coord) => Promise<void>
  toggleUnstackArmed: () => void
  /** Apply a move pushed over the hub (made by the opponent, or an echo of our own). */
  applyRemoteMove: (data: SubmitMoveResponse) => Promise<void>
  /** Apply the authoritative outcome of a timeout, pushed as a `gameEnded` hub event — never a
   *  `moveApplied` (no move was actually applied; see `api/types.ts`'s `GameEndedEvent` doc). */
  applyGameEnded: (data: GameEndedEvent) => void
  /** Tell the server to authoritatively recheck the current mover's deadline. Called by
   *  `GameClock`'s local tick the instant it observes zero; errors are expected/benign (a 409
   *  means it wasn't actually expired yet, or another client/the server's own broadcast already
   *  resolved it) — the outcome always arrives via `gameEnded` or the next resync instead. */
  claimTimeout: () => Promise<void>
  /** Applies an `opponentDisconnected` hub push: stamps that seat's disconnect timestamp. */
  applyOpponentDisconnected: (data: OpponentDisconnectedEvent) => void
  /** Applies an `opponentReconnected` hub push: clears that seat's disconnect timestamp. */
  applyOpponentReconnected: (data: OpponentReconnectedEvent) => void
  /** Applies a `rematchOffered` hub push: shows the banner, unless `seat` is this client's own
   *  (an echo of its own just-sent request, not something to react to). */
  applyRematchOffered: (data: RematchOfferedEvent) => void
  /** Applies a `rematchReady` hub push: both seats (including the original requester, who was
   *  waiting) enter the new room via `enterRoom`, computing their own new seat by flipping the
   *  seat they already held — a rematch always swaps seats. No-op for a spectator. */
  applyRematchReady: (data: RematchReadyEvent) => void
  /** Applies a `rematchDeclined` hub push: resets both `rematchRequestedByMe` and
   *  `rematchOfferedByOpponent` — declining always clears both sides server-side too. */
  applyRematchDeclined: (data: RematchDeclinedEvent) => void
  /** Tell the server to authoritatively recheck whether the *other* seat's disconnect has been
   *  outstanding long enough to claim abandonment. Mirrors `claimTimeout`: called by
   *  `DisconnectBanner`'s local countdown the instant it observes zero; errors are expected/
   *  benign (a 409 means the window hasn't elapsed, nothing's tracked disconnected, or the game
   *  already resolved) — the outcome always arrives via `gameEnded` or the next resync instead. */
  claimAbandonment: () => Promise<void>
  /** Concedes on behalf of the local seat (the other seat wins, `EndReason = "Resignation"`).
   *  No-op without an active game or when not seated as `P1`/`P2` (a spectator has nothing to
   *  resign) — except in Local Play (`isLocal`), which has no seated player at all, so it
   *  concedes on behalf of whoever's turn it is, and a bot game (`botSeat`), which also has no
   *  seat but does have exactly one human player — the seat the bot doesn't occupy. Reads local
   *  state and calls the client the same way `claimTimeout` does, and the
   *  success path is identically fire-and-forget — the authoritative outcome arrives via
   *  `gameEnded` or the next resync, not this call's return value. Unlike `claimTimeout` (a
   *  clock-tick-driven call where a 409 race is expected/benign), this is a deliberate user
   *  click, so a failure sets `error` like every other user-initiated store action does. */
  resign: () => Promise<void>
  /** Marks `WinOverlay` dismissed for the current game — see `overlayDismissed`'s doc. */
  dismissOverlay: () => void
  /** "Play again": seated as P1/P2 in a real multiplayer room, requests a rematch with the same
   *  opponent (`requestRematch`) instead of starting a fresh unrelated game — see that action's
   *  doc. Otherwise unchanged: keeps the bot opponent (same difficulty, same human seat) for a
   *  bot game, else starts a fresh Local Play game in the current variant. A spectator seat falls
   *  through to the same local-game branch a non-room game does — there's no rematch to offer a
   *  spectator. Shared by `WinOverlay`'s own button and `PlayAgainButton`'s same-slot one so both
   *  start identically. */
  playAgain: () => void
  /**
   * "I want a rematch" — see `RoomService.RequestRematchAsync`'s doc comment for the propose/
   * match shape this mirrors: no separate accept step, since the other seat's own call to this
   * same action (via its own `playAgain` or `RematchOfferBanner`'s Accept) is what completes the
   * match. Sets `rematchRequestedByMe` while waiting; on a match, enters the new room directly
   * via `enterRoom` (the authoritative outcome always arrives this way or via `rematchReady` —
   * whichever lands first — never assumed from a stale local flag). No-op unless seated P1/P2.
   */
  requestRematch: () => Promise<void>
  /** Declines the other seat's pending rematch request (or withdraws this seat's own) — see
   *  `RoomService.DeclineRematchAsync`. Clears the banner/waiting state immediately client-side;
   *  a failed call just leaves it cleared, same fire-and-forget discipline as `claimTimeout`. */
  declineRematch: () => Promise<void>
  /** Re-fetch the authoritative game state (used after a hub reconnect). */
  resync: () => Promise<void>
  /** Re-open the hub connection under the current auth token (called on login/logout). */
  reconnectRealtime: () => void
  /**
   * Boot-time recovery for the active-game banner: `useGame` has no `persist()`, so a hard
   * refresh or a fresh tab on any page other than `/play` starts with no game loaded even though
   * one may still be `InProgress` server-side — `PlayScreen`'s own URL-params resume only runs
   * when `/play` itself is mounted. Lists the caller's own games, picks the first still
   * `InProgress` one (there's at most one in practice — starting a second is blocked while one is
   * active), and loads it in with the seat `GameResponse.mySeat` reports — never a client-guessed
   * value, since there's no room-join URL here to read a seat back out of. No-op if a game is
   * already loaded, none of the caller's games are active, or the fetch fails; called once from
   * `AppLayout` on login.
   */
  recoverActiveGame: () => Promise<void>
  dismissError: () => void
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** The clock fields shared by `GameResponse` and `SubmitMoveResponse` (the latter minus `timedOut`). */
interface ClockPayload {
  timeControl: string | null
  p1RemainingMs: number | null
  p2RemainingMs: number | null
  turnStartedAtUtc: string | null
  turnDeadlineUtc: string | null
  serverNowUtc: string
}

/**
 * Snaps store clock state to server truth from any payload that carries it: computes
 * `serverOffsetMs` fresh every time, so `GameClock`'s local tick never accumulates drift. See
 * `GameStore.serverOffsetMs` for why this is computed from the payload's clock, not read once.
 */
function clockFields(g: ClockPayload) {
  return {
    timeControl: g.timeControl,
    p1RemainingMs: g.p1RemainingMs,
    p2RemainingMs: g.p2RemainingMs,
    turnStartedAtUtc: g.turnStartedAtUtc,
    turnDeadlineUtc: g.turnDeadlineUtc,
    serverOffsetMs: new Date(g.serverNowUtc).getTime() - Date.now(),
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A hub push that landed mid-animation; drained when the store goes idle. */
let pendingRemote: SubmitMoveResponse | null = null

export const useGame = create<GameStore>((set, get) => {
  /**
   * Phases one move result onto the board: slide → bullet → destroy → settle. `movedBoard` is
   * the board with the move applied but nothing destroyed yet, keeping piece ids so the slide
   * animates. Shared by local submits and hub-pushed moves.
   */
  async function playMoveResult(data: SubmitMoveResponse, movedBoard: ClientBoard): Promise<void> {
    let settledBoard = applyLaserResult(movedBoard, data.eliminated, data.damaged)
    if (!matchesServer(settledBoard, data.boardState)) settledBoard = identify(data.boardState)

    const dyingIds = movedBoard.pieces
      .filter((p) => data.eliminated.some((e) => e.row === p.row && e.col === p.col))
      .map((p) => p.id)
    const pharaohKilled = data.eliminated.find((e) => e.kind === 'Pharaoh') ?? null
    const gameEnding = data.status !== 'InProgress'

    const points = beamPoints(data.laserSegments)
    const { laser, animation } = useDisplaySettings.getState()

    // 1. piece slides to its new square; turn/status/clock update now, input stays locked.
    // `overlayReady` stays false through a game-ending move's animation so `WinOverlay` doesn't
    // pop up over a mid-slide/mid-laser board — see its doc on `GameStore`.
    set({
      board: movedBoard,
      selected: null,
      legalTargets: [],
      stackTargets: [],
      unstackTargets: [],
      unstackArmed: false,
      turn: data.currentTurn,
      status: data.status,
      moveCount: data.moveNumber,
      beam: null,
      dying: [],
      overlayReady: !gameEnding,
      ...clockFields(data),
    })

    // 2. fire the bullet
    await sleep(animation.moveMs)
    set({ beam: { points, id: Date.now() } })
    await sleep(beamDurationMs(points, { speed: laser.speed, bulletLength: laser.bulletLength }))

    // 3. destroy whatever it hit
    if (dyingIds.length > 0) {
      set({ beam: null, dying: dyingIds })
      await sleep(animation.deathMs)
    }

    // 3.5. an extra beat when the Pharaoh itself died — the game-ending piece gets a more
    // deliberate death than an ordinary pop-and-vanish before the win popup appears.
    if (pharaohKilled) {
      set({ dying: [], pharaohDown: { row: pharaohKilled.row, col: pharaohKilled.col, owner: pharaohKilled.owner } })
      await sleep(animation.pharaohDeathMs)
    }

    // 4. settle
    set({ board: settledBoard, beam: null, dying: [], pharaohDown: null, busy: false, overlayReady: true })
  }

  /** Run any hub push that arrived while an animation was playing. */
  function drainPending(): void {
    const queued = pendingRemote
    pendingRemote = null
    if (queued && queued.moveNumber > get().moveCount) void get().applyRemoteMove(queued)
  }

  async function submit(move: MoveRequest): Promise<void> {
    const { gameId, board, seat, turn, status, botSeat } = get()
    if (!gameId || !board) return
    if (!canAct(seat, turn, status, botSeat)) return

    pushRingEntry({ kind: 'action', label: `submit ${move.type}`, detail: { gameId, seat, move } })

    set({ busy: true, error: null })

    if (botSeat) {
      // Bot game (`backlog/08-bot-opponent.md`): the server plays the human's own move and — if it's
      // now the bot's turn — the bot's reply as two separately committed/broadcast steps with a
      // real "thinking" delay between them (`GameService.PlayBotReplyIfDueAsync`), but this POST
      // still only resolves once *both* are done. Holding `busy` for that whole await (like the
      // non-bot path below does) would block `applyRemoteMove` (see its own doc: it queues any
      // push that arrives while `busy`) for the entire span, so the human's own hub-pushed move
      // would sit queued behind the bot's delay instead of animating right away — collapsing both
      // plies into a single instant jump the moment the request finally resolves. Clear `busy`
      // immediately instead: the human's own move (broadcast well before the bot's delay elapses)
      // and the bot's reply both arrive and animate independently via `applyRemoteMove`, exactly
      // like an opponent's remote move already does in a room game. The response body itself stays
      // unused below, for the same reason — it reflects post-both-plies state, not the human's own
      // ply, so using it directly would show the bot's laser trace as if the human fired it.
      set({
        selected: null,
        legalTargets: [],
        stackTargets: [],
        unstackTargets: [],
        unstackArmed: false,
        busy: false,
      })
    }

    const res = await submitMove(gameId, move, seat ?? undefined)

    if (!res.ok) {
      set({ busy: false })
      if (res.timeout) {
        // The move arrived after the mover's clock had already expired — the game ended as a
        // side effect of the rejected submission (not a moveApplied, no board change). Applying
        // it directly (like a gameEnded hub push) is now purely a round-trip-avoiding
        // optimization over the loadGame() fallback below — GET now exposes `endReason` too, so
        // a plain reload would land on the same correct answer, just one request slower.
        get().applyGameEnded(res.timeout)
        set({
          selected: null,
          legalTargets: [],
          stackTargets: [],
          unstackTargets: [],
          unstackArmed: false,
          error: res.error,
        })
      } else {
        // The client mirror let this through but the server refused it — trust the server.
        await get().loadGame(gameId)
        set({ error: res.error })
      }
      return
    }

    if (botSeat) return // both plies arrive (or are already arriving) via applyRemoteMove hub pushes.

    // The board the laser fired into (move applied, nothing destroyed yet) keeps piece ids.
    await playMoveResult(res.data, applyMove(board, move))
    drainPending()
  }

  // Cleared state that a fresh board load resets; deliberately leaves seat/roomCode alone so
  // an in-room reload (e.g. after a rejected move) keeps the seat. Every caller of this also has
  // a `GameResponse` in hand and sets `endReason: g.endReason` itself (GET now exposes it
  // directly), so it's deliberately not included here — there's no safe "cleared" value for it
  // that wouldn't just be immediately overwritten anyway.
  const freshBoardState: Partial<GameStore> = {
    selected: null,
    legalTargets: [],
    stackTargets: [],
    unstackTargets: [],
    unstackArmed: false,
    beam: null,
    dying: [],
    pharaohDown: null,
    overlayReady: true,
    overlayDismissed: false,
    busy: false,
    error: null,
    // A fresh load/resync has no way to learn a live disconnect state except a future hub push
    // (see `p1DisconnectedAtUtc`'s doc) — start clean rather than carry over a previous game's.
    p1DisconnectedAtUtc: null,
    p2DisconnectedAtUtc: null,
    // Same reasoning: no way to learn a stale rematch offer/wait state except a hub push (or a
    // `rematchGameId` read on the game this state belonged to, which is now behind us) — start
    // clean rather than carry a previous game's rematch dance into a new one.
    rematchRequestedByMe: false,
    rematchOfferedByOpponent: false,
    // A previous game's last-observed move must never leak into a new one's bug-report bundle
    // (it'd attach a trace id for an unrelated game) — start clean like every other per-game field
    // here.
    lastMoveApplied: null,
    // Every caller below that loads a real `GameResponse` overrides these explicitly from
    // `g.botSeat`/`g.botDifficulty` — this default only matters if one ever doesn't, so a stale
    // previous game's bot state can never leak into a new one.
    botSeat: null,
    botDifficulty: null,
    // Only `newGame` (Local Play) ever sets this true — every other loader below spreads this
    // default, so a stale previous game's local-ness can never leak into a new one.
    isLocal: false,
  }

  async function startFollowing(gameId: string): Promise<void> {
    await followGame(
      gameId,
      get().seat,
      (data) => void get().applyRemoteMove(data),
      () => void get().resync(),
      (data) => get().applyGameEnded(data),
      (data) => get().applyOpponentDisconnected(data),
      (data) => get().applyOpponentReconnected(data),
      // A first-time seat join carries no state of its own — just re-fetch so the new player's
      // profile (name/avatar/rating) lands on their card. Same resync the hub-reconnect path uses.
      () => void get().resync(),
      (data) => get().applyRematchOffered(data),
      (data) => get().applyRematchReady(data),
      (data) => get().applyRematchDeclined(data),
    )
  }

  async function loadInto(
    gameId: string,
    seatPatch: Partial<GameStore>,
  ): Promise<void> {
    const g = await getGame(gameId)
    await unfollow()
    set({
      ...freshBoardState,
      ...seatPatch,
      gameId: g.id,
      board: identify(g.boardState),
      turn: g.currentTurn,
      status: g.status,
      moveCount: g.moveCount,
      ruleset: g.ruleset,
      layout: g.layout,
      rated: g.rated,
      p1Claimed: g.p1Claimed,
      p2Claimed: g.p2Claimed,
      p1Profile: g.p1Profile,
      p2Profile: g.p2Profile,
      endReason: g.endReason,
      botSeat: g.botSeat,
      botDifficulty: g.botDifficulty,
      ...clockFields(g),
    })
    void startFollowing(g.id)
  }

  return {
    gameId: null,
    board: null,
    turn: 'P1',
    status: 'InProgress',
    moveCount: 0,
    ruleset: 'Classic',
    layout: 'Classic',
    seat: null,
    roomCode: null,
    isLocal: false,
    rated: false,
    p1Claimed: false,
    p2Claimed: false,
    p1Profile: null,
    p2Profile: null,
    timeControl: null,
    p1RemainingMs: null,
    p2RemainingMs: null,
    turnStartedAtUtc: null,
    turnDeadlineUtc: null,
    serverOffsetMs: 0,
    endReason: null,
    botSeat: null,
    botDifficulty: null,
    p1DisconnectedAtUtc: null,
    p2DisconnectedAtUtc: null,
    rematchRequestedByMe: false,
    rematchOfferedByOpponent: false,
    selected: null,
    legalTargets: [],
    stackTargets: [],
    unstackTargets: [],
    unstackArmed: false,
    busy: false,
    error: null,
    beam: null,
    dying: [],
    pharaohDown: null,
    overlayReady: true,
    overlayDismissed: false,
    lastMoveApplied: null,

    newGame: async (options) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        // No explicit choice (e.g. "Play again") keeps the current variant.
        const g = await createGame(options ?? { ruleset: get().ruleset, layout: get().layout })
        await unfollow()
        // Local play has no accounts to attach — synthesize two pop-culture identities so
        // PlayerCard renders the same as a signed-in game instead of falling back to "Guest"
        // (see localPlayerNames.ts). rating: 0 matches the existing untimed-game convention.
        const [p1Identity, p2Identity] = pickLocalPlayerIdentities()
        set({
          ...freshBoardState,
          seat: null,
          roomCode: null,
          isLocal: true,
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
          ruleset: g.ruleset,
          layout: g.layout,
          rated: g.rated,
          p1Claimed: g.p1Claimed,
          p2Claimed: g.p2Claimed,
          p1Profile: { ...p1Identity, rating: 0 },
          p2Profile: { ...p2Identity, rating: 0 },
          endReason: g.endReason,
          botSeat: g.botSeat,
          botDifficulty: g.botDifficulty,
          ...clockFields(g),
        })
        void startFollowing(g.id)
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    newBotGame: async (options) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const g = await createBotGame(options)
        await unfollow()
        set({
          ...freshBoardState,
          seat: null,
          roomCode: null,
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
          ruleset: g.ruleset,
          layout: g.layout,
          rated: g.rated,
          p1Claimed: g.p1Claimed,
          p2Claimed: g.p2Claimed,
          p1Profile: g.p1Profile,
          p2Profile: g.p2Profile,
          endReason: g.endReason,
          botSeat: g.botSeat,
          botDifficulty: g.botDifficulty,
          ...clockFields(g),
        })
        void startFollowing(g.id)
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    loadGame: async (id, seat) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const seatPatch = seat === undefined ? {} : { seat, roomCode: seat === null ? null : get().roomCode }
        await loadInto(id, seatPatch)
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    createRoom: async (options) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const room = await apiCreateRoom(options)
        await loadInto(room.gameId, { seat: room.seat, roomCode: room.code })
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    enterRoom: async (room) => {
      // Deliberately no `busy` guard (unlike every other loader above). `busy` only ever clears on
      // a *settled* load (`freshBoardState`'s `busy: false` on success, or the `catch` below on a
      // rejection) — a load that hangs instead of rejecting (a stalled `getGame`, or the component
      // that started it unmounting mid-fetch) leaves `busy: true` stuck forever. Every caller of
      // `enterRoom` (the `inviteAccepted` hub push and `InvitePlayScreen`'s own fallback poll for a
      // missed push, both driving an invite-accept the caller never had a chance to retry) then
      // navigates to `/play` assuming the room loaded, when a stuck `busy` would have silently
      // no-op'd it — leaving the store showing whatever unrelated game/state was there before,
      // indefinitely. `loadInto` is a plain fetch-and-set for a known `gameId`, so it's also safe
      // to run concurrently with itself, which matters here too: the push and the poll can both
      // land for the same accepted invite around the same time.
      set({ busy: true, error: null })
      try {
        await loadInto(room.gameId, { seat: room.seat, roomCode: room.code })
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    selectSquare: (c) => {
      const { board, turn, status, busy, seat, ruleset, botSeat } = get()
      if (!board || busy || !canAct(seat, turn, status, botSeat)) return
      const piece = pieceAt(board, c)
      if (!piece || piece.owner !== turn) {
        set({ selected: null, legalTargets: [], stackTargets: [], unstackTargets: [], unstackArmed: false })
        return
      }
      // Stacking is a Classic-only move kind; Khet2 has StackableObelisks: false.
      const stacking = ruleset === 'Classic'
      set({
        selected: c,
        legalTargets: legalDestinations(board, c, turn),
        stackTargets: stacking ? legalStackTargets(board, c, turn) : [],
        unstackTargets: stacking ? computeUnstackTargets(board, c, turn) : [],
        unstackArmed: false,
      })
    },

    clearSelection: () =>
      set({ selected: null, legalTargets: [], stackTargets: [], unstackTargets: [], unstackArmed: false }),

    moveTo: async (to) => {
      const { selected } = get()
      if (!selected) return
      await submit({ type: 'move', from: selected, to })
    },

    rotateSelected: async (dir) => {
      const { selected } = get()
      if (!selected) return
      await submit({ type: 'rotate', from: selected, rotation: dir })
    },

    stackTo: async (to) => {
      const { selected } = get()
      if (!selected) return
      await submit({ type: 'stack', from: selected, to })
    },

    unstackTo: async (to) => {
      const { selected } = get()
      if (!selected) return
      await submit({ type: 'unstack', from: selected, to })
    },

    toggleUnstackArmed: () => set((s) => ({ unstackArmed: !s.unstackArmed })),

    applyRemoteMove: async (data) => {
      const { board, gameId } = get()
      if (!board || !gameId) return
      // Echo of our own move, or one we've already applied.
      if (data.moveNumber <= get().moveCount) return
      // A move is mid-flight; queue the newest push and drain it when idle.
      if (get().busy) {
        if (!pendingRemote || data.moveNumber > pendingRemote.moveNumber) pendingRemote = data
        return
      }

      pushRingEntry({
        kind: 'action',
        label: 'applyRemoteMove',
        detail: { gameId, moveNumber: data.moveNumber, currentTurn: data.currentTurn, traceId: data.traceId },
      })
      set({
        busy: true,
        error: null,
        selected: null,
        legalTargets: [],
        stackTargets: [],
        unstackTargets: [],
        unstackArmed: false,
        lastMoveApplied: data,
      })
      const move = inferMove(board, data.boardState, data.eliminated)
      // Couldn't reconstruct the move: skip the slide, still play the beam, then snap.
      const movedBoard = move ? applyMove(board, move) : identify(data.boardState)
      await playMoveResult(data, movedBoard)
      drainPending()
    },

    applyGameEnded: (data) => {
      pushRingEntry({
        kind: 'action',
        label: 'applyGameEnded',
        detail: { status: data.status, endReason: data.endReason, traceId: data.traceId },
      })
      // No move animation runs for a timeout/resignation/abandonment ending — the board itself
      // never changes. Resignation is the one exception: the resigning side's Pharaoh gets the
      // same "Pharaoh down" beat a laser kill would give it before the win popup appears, so
      // resigning doesn't feel like a different, lesser way to lose.
      const { board } = get()
      const loserPharaoh =
        data.endReason === 'Resignation' && board
          ? board.pieces.find((p) => p.kind === 'Pharaoh' && p.owner === (data.status === 'P1Win' ? 'P2' : 'P1'))
          : null

      set({
        status: data.status,
        endReason: data.endReason,
        overlayReady: !loserPharaoh,
        pharaohDown: loserPharaoh
          ? { row: loserPharaoh.row, col: loserPharaoh.col, owner: loserPharaoh.owner }
          : null,
        serverOffsetMs: new Date(data.serverNowUtc).getTime() - Date.now(),
      })

      if (loserPharaoh) {
        const { animation } = useDisplaySettings.getState()
        sleep(animation.pharaohDeathMs).then(() => set({ pharaohDown: null, overlayReady: true }))
      }
    },

    claimTimeout: async () => {
      const { gameId } = get()
      if (!gameId) return
      try {
        await apiClaimTimeout(gameId)
      } catch {
        /* expected/benign — see the `claimTimeout` doc on GameStore. */
      }
    },

    applyOpponentDisconnected: ({ seat, disconnectedAtUtc }) =>
      set(seat === 'P1' ? { p1DisconnectedAtUtc: disconnectedAtUtc } : { p2DisconnectedAtUtc: disconnectedAtUtc }),

    applyOpponentReconnected: ({ seat }) =>
      set(seat === 'P1' ? { p1DisconnectedAtUtc: null } : { p2DisconnectedAtUtc: null }),

    applyRematchOffered: ({ seat }) => {
      if (seat === get().seat) return // echo of this client's own just-sent request
      set({ rematchOfferedByOpponent: true })
    },

    applyRematchReady: ({ gameId, code }) => {
      const { seat } = get()
      if (seat !== 'P1' && seat !== 'P2') return // no rematch to enter for a spectator
      set({ rematchRequestedByMe: false, rematchOfferedByOpponent: false })
      void get().enterRoom({ gameId, code, seat: seat === 'P1' ? 'P2' : 'P1' })
    },

    applyRematchDeclined: () => set({ rematchRequestedByMe: false, rematchOfferedByOpponent: false }),

    claimAbandonment: async () => {
      const { gameId, seat } = get()
      if (!gameId || (seat !== 'P1' && seat !== 'P2')) return
      try {
        await apiClaimAbandonment(gameId, seat)
      } catch {
        /* expected/benign — see the `claimAbandonment` doc on GameStore. */
      }
    },

    resign: async () => {
      const { gameId, seat, isLocal, turn, botSeat } = get()
      // Local play has nobody seated as "the" player — either side of the board can resign, so
      // fall back to whoever's turn it is (the one deliberate action available to them right now).
      // A bot game has no seat either (never account-attached), but unlike local play there IS a
      // single human player — the seat botSeat doesn't occupy — so resign concedes on their behalf
      // specifically, not whoever's turn it happens to be.
      const resignSeat =
        seat === 'P1' || seat === 'P2' ? seat : isLocal ? turn : botSeat !== null ? (botSeat === 'P1' ? 'P2' : 'P1') : null
      if (!gameId || !resignSeat) return
      try {
        await apiResignGame(gameId, resignSeat)
      } catch (e) {
        // Unlike `claimTimeout` (fired from a clock tick, where a 409 is an expected race),
        // this is a deliberate user click — surface a failure via the same error banner every
        // other user-initiated action uses, so a resign that didn't actually go through isn't
        // silently indistinguishable from one that did.
        set({ error: errorText(e) })
      }
    },

    dismissOverlay: () => set({ overlayDismissed: true }),

    playAgain: () => {
      const { seat, botSeat, botDifficulty, ruleset, layout, requestRematch, newGame, newBotGame } = get()
      if (seat === 'P1' || seat === 'P2') {
        void requestRematch()
        return
      }
      if (botSeat !== null && botDifficulty !== null) {
        void newBotGame({
          difficulty: botDifficulty,
          ruleset,
          layout,
          playerSeat: botSeat === 'P1' ? 'P2' : 'P1',
        })
      } else {
        void newGame()
      }
    },

    requestRematch: async () => {
      const { gameId, seat } = get()
      if (!gameId || (seat !== 'P1' && seat !== 'P2')) return
      try {
        const result = await apiRequestRematch(gameId, seat)
        if (result.matched) {
          set({ rematchRequestedByMe: false, rematchOfferedByOpponent: false })
          await get().enterRoom(result.room)
        } else {
          set({ rematchRequestedByMe: true })
        }
      } catch (e) {
        set({ error: errorText(e) })
      }
    },

    declineRematch: async () => {
      const { gameId, seat } = get()
      if (!gameId || (seat !== 'P1' && seat !== 'P2')) return
      set({ rematchRequestedByMe: false, rematchOfferedByOpponent: false })
      try {
        await apiDeclineRematch(gameId, seat)
      } catch {
        /* fire-and-forget — the banner/waiting state is already cleared client-side */
      }
    },

    resync: async () => {
      const { gameId, busy } = get()
      if (!gameId || busy) return
      pushRingEntry({ kind: 'action', label: 'resync', detail: { gameId } })
      try {
        const g = await getGame(gameId)
        set({
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
          ruleset: g.ruleset,
          layout: g.layout,
          rated: g.rated,
          p1Claimed: g.p1Claimed,
          p2Claimed: g.p2Claimed,
          p1Profile: g.p1Profile,
          p2Profile: g.p2Profile,
          endReason: g.endReason,
          botSeat: g.botSeat,
          botDifficulty: g.botDifficulty,
          ...clockFields(g),
        })
        // Recovery for a missed `rematchReady` push (e.g. this client was disconnected at the
        // moment it fired): `rematchGameId` is the same fallback `GameResponse` always carries it
        // for. `requestRematch()` is idempotent once matched — it just re-fetches the same room's
        // `RoomResponse` (with its code) and enters it, no second game created.
        const { seat } = get()
        if (g.rematchGameId && (seat === 'P1' || seat === 'P2')) void get().requestRematch()
      } catch {
        /* a failed resync just leaves the last-known state; the next push corrects it */
      }
    },

    reconnectRealtime: () => {
      // The hub connection captured the auth token (or lack of one) at connect time; a login
      // or logout mid-game needs a fresh connection for accessTokenFactory to pick it up. A real
      // teardown (not just `unfollow()`) is required here — `disconnect()` actually stops the
      // socket so the next connect re-reads `accessTokenFactory` under the new identity.
      const { gameId } = get()
      if (!gameId) return
      pushRingEntry({ kind: 'action', label: 'reconnectRealtime', detail: { gameId } })
      void disconnect().then(() => startFollowing(gameId))
    },

    recoverActiveGame: async () => {
      // Same busy-gate shape every other loader uses — set synchronously, before the first
      // `await`, so a same-tick mount of `PlayScreen`'s own URL-params resume (effects fire
      // child-before-parent on mount, so PlayScreen's own loadGame call — if the URL actually
      // names a game — already ran and set `busy` by the time this effect fires in `AppLayout`)
      // correctly no-ops instead of racing this fetch.
      if (get().gameId || get().busy) return
      set({ busy: true, error: null })
      try {
        const mine = await listMyGames()
        const active = mine.find((g) => g.status === 'InProgress')
        if (!active) {
          set({ busy: false })
          return
        }
        const g = await getGame(active.id)
        if (g.status !== 'InProgress') {
          // Finished between the list and this fetch — nothing left to recover.
          set({ busy: false })
          return
        }
        await unfollow()
        set({
          ...freshBoardState,
          seat: g.mySeat,
          // Never fetched back — see `PlayScreen`'s player-card gate (`seat !== null || isLocal`,
          // not `roomCode`) for why this doesn't hide anything a recovered room game needs.
          roomCode: null,
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
          ruleset: g.ruleset,
          layout: g.layout,
          rated: g.rated,
          p1Claimed: g.p1Claimed,
          p2Claimed: g.p2Claimed,
          p1Profile: g.p1Profile,
          p2Profile: g.p2Profile,
          endReason: g.endReason,
          botSeat: g.botSeat,
          botDifficulty: g.botDifficulty,
          ...clockFields(g),
        })
        void startFollowing(g.id)
      } catch {
        /* best-effort recovery — leave the app in its normal empty-of-a-game state */
        set({ busy: false })
      }
    },

    dismissError: () => set({ error: null }),
  }
})
