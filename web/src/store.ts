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
  getGame,
  joinRoom as apiJoinRoom,
  resignGame as apiResignGame,
  submitMove,
  type NewGameOptions,
} from './api/client'
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

  /** True only when both seats were filled by already-authenticated accounts at create/join. */
  rated: boolean
  /** Whether an account has claimed each seat (see `POST /api/games/{id}/claim-seat`). */
  p1Claimed: boolean
  p2Claimed: boolean

  /** Rendered identity + category rating for each seat, from `GameResponse.p1Profile`/
   *  `p2Profile` — null while that seat is anonymous/unclaimed. Snapped on every load/resync;
   *  unlike the clock fields, there's no hub push that updates this mid-game, so `RoomStatusBar`
   *  explicitly calls `resync()` right after a successful `claimSeat()` so the newly-claimed
   *  account's card updates immediately rather than waiting for some unrelated resync. Feeds
   *  `PlayerCard` in `PlayScreen`. */
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
   *  `plans/08-bot-opponent.md`). Fixed for the life of the game; snapped on every load/resync/
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

  newGame: (options?: NewGameOptions) => Promise<void>
  /** Starts a solo game against the server-side bot (`POST /api/games/bot`). Same shape as
   *  `newGame`, plus the required `difficulty` and an optional `playerSeat`. */
  newBotGame: (options: CreateBotGameOptions) => Promise<void>
  loadGame: (id: string, seat?: Seat | null) => Promise<void>
  createRoom: (options?: NewGameOptions) => Promise<void>
  joinRoom: (code: string) => Promise<void>
  /** Loads directly from an already-obtained `RoomResponse` — used after
   *  `POST /api/invites/{id}/accept`, which returns the same shape `RoomsController.Join` does
   *  but without a join-code round trip (`invites.ts`/`inviteStore.ts` calls this instead of
   *  `joinRoom`). */
  enterRoom: (room: RoomResponse) => Promise<void>
  leaveRoom: () => void
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
  /** Tell the server to authoritatively recheck whether the *other* seat's disconnect has been
   *  outstanding long enough to claim abandonment. Mirrors `claimTimeout`: called by
   *  `DisconnectBanner`'s local countdown the instant it observes zero; errors are expected/
   *  benign (a 409 means the window hasn't elapsed, nothing's tracked disconnected, or the game
   *  already resolved) — the outcome always arrives via `gameEnded` or the next resync instead. */
  claimAbandonment: () => Promise<void>
  /** Concedes on behalf of the local seat (the other seat wins, `EndReason = "Resignation"`).
   *  No-op without an active game or when not seated as `P1`/`P2` (a spectator has nothing to
   *  resign). Reads local state and calls the client the same way `claimTimeout` does, and the
   *  success path is identically fire-and-forget — the authoritative outcome arrives via
   *  `gameEnded` or the next resync, not this call's return value. Unlike `claimTimeout` (a
   *  clock-tick-driven call where a 409 race is expected/benign), this is a deliberate user
   *  click, so a failure sets `error` like every other user-initiated store action does. */
  resign: () => Promise<void>
  /** Re-fetch the authoritative game state (used after a hub reconnect). */
  resync: () => Promise<void>
  /** Re-open the hub connection under the current auth token (called on login/logout). */
  reconnectRealtime: () => void
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

    const points = beamPoints(data.laserSegments)
    const { laser, animation } = useDisplaySettings.getState()

    // 1. piece slides to its new square; turn/status/clock update now, input stays locked.
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

    // 4. settle
    set({ board: settledBoard, beam: null, dying: [], busy: false })
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

    set({ busy: true, error: null })
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

    if (botSeat) {
      // Bot game (`plans/08-bot-opponent.md`): per the wire contract, `SubmitMoveResponse` here
      // reflects the *bot's* resulting state when the bot replies inline, not the human's own
      // ply — using it directly would show the bot's laser trace as if the human fired it. The
      // plan's own sanctioned fallback for this: don't touch the board off this response at all,
      // and let both plies (the human's own move, then the bot's reply) arrive as ordinary
      // `moveApplied` hub pushes and animate via `applyRemoteMove` — exactly like an opponent's
      // remote move already does in a room game. Clearing `busy` here just unblocks that path
      // (`applyRemoteMove` queues pushes that land mid-animation, but does nothing until `busy`
      // is false); if a push already arrived while this request was in flight, drain it now.
      set({
        selected: null,
        legalTargets: [],
        stackTargets: [],
        unstackTargets: [],
        unstackArmed: false,
        busy: false,
      })
      drainPending()
      return
    }

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
    busy: false,
    error: null,
    // A fresh load/resync has no way to learn a live disconnect state except a future hub push
    // (see `p1DisconnectedAtUtc`'s doc) — start clean rather than carry over a previous game's.
    p1DisconnectedAtUtc: null,
    p2DisconnectedAtUtc: null,
    // Every caller below that loads a real `GameResponse` overrides these explicitly from
    // `g.botSeat`/`g.botDifficulty` — this default only matters if one ever doesn't, so a stale
    // previous game's bot state can never leak into a new one.
    botSeat: null,
    botDifficulty: null,
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
    selected: null,
    legalTargets: [],
    stackTargets: [],
    unstackTargets: [],
    unstackArmed: false,
    busy: false,
    error: null,
    beam: null,
    dying: [],

    newGame: async (options) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        // No explicit choice (e.g. "Play again") keeps the current variant.
        const g = await createGame(options ?? { ruleset: get().ruleset, layout: get().layout })
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

    joinRoom: async (code) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const room = await apiJoinRoom(code.trim().toUpperCase())
        await loadInto(room.gameId, { seat: room.seat, roomCode: room.code })
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    enterRoom: async (room) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        await loadInto(room.gameId, { seat: room.seat, roomCode: room.code })
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    leaveRoom: () => {
      // Keep the hub subscription — staying in the group is harmless and avoids a
      // half-connected client that can send moves but receives nothing back.
      set({ seat: null, roomCode: null })
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

      set({
        busy: true,
        error: null,
        selected: null,
        legalTargets: [],
        stackTargets: [],
        unstackTargets: [],
        unstackArmed: false,
      })
      const move = inferMove(board, data.boardState, data.eliminated)
      // Couldn't reconstruct the move: skip the slide, still play the beam, then snap.
      const movedBoard = move ? applyMove(board, move) : identify(data.boardState)
      await playMoveResult(data, movedBoard)
      drainPending()
    },

    applyGameEnded: (data) => {
      set({
        status: data.status,
        endReason: data.endReason,
        serverOffsetMs: new Date(data.serverNowUtc).getTime() - Date.now(),
      })
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
      const { gameId, seat } = get()
      if (!gameId || (seat !== 'P1' && seat !== 'P2')) return
      try {
        await apiResignGame(gameId, seat)
      } catch (e) {
        // Unlike `claimTimeout` (fired from a clock tick, where a 409 is an expected race),
        // this is a deliberate user click — surface a failure via the same error banner every
        // other user-initiated action uses, so a resign that didn't actually go through isn't
        // silently indistinguishable from one that did.
        set({ error: errorText(e) })
      }
    },

    resync: async () => {
      const { gameId, busy } = get()
      if (!gameId || busy) return
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
      void disconnect().then(() => startFollowing(gameId))
    },

    dismissError: () => set({ error: null }),
  }
})
