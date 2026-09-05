import { create } from 'zustand'
import type {
  Coord,
  EndReason,
  GameEndedEvent,
  GameStatus,
  MoveRequest,
  Player,
  RotationDir,
  Seat,
  SubmitMoveResponse,
} from './api/types'
import {
  claimTimeout as apiClaimTimeout,
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
import { followGame, unfollow } from './realtime'
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
  loadGame: (id: string, seat?: Seat | null) => Promise<void>
  createRoom: (options?: NewGameOptions) => Promise<void>
  joinRoom: (code: string) => Promise<void>
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
  /** Concedes on behalf of the local seat (the other seat wins, `EndReason = "Resignation"`).
   *  No-op without an active game or when not seated as `P1`/`P2` (a spectator has nothing to
   *  resign). Same fire-and-forget shape as `claimTimeout`: errors are expected/benign (e.g. an
   *  already-finished race) — the authoritative outcome arrives via `gameEnded` or the next
   *  resync, not this call's return value. */
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
    const { gameId, board, seat, turn, status } = get()
    if (!gameId || !board) return
    if (!canAct(seat, turn, status)) return

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
  }

  async function startFollowing(gameId: string): Promise<void> {
    await followGame(
      gameId,
      (data) => void get().applyRemoteMove(data),
      () => void get().resync(),
      (data) => get().applyGameEnded(data),
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
      endReason: g.endReason,
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
    timeControl: null,
    p1RemainingMs: null,
    p2RemainingMs: null,
    turnStartedAtUtc: null,
    turnDeadlineUtc: null,
    serverOffsetMs: 0,
    endReason: null,
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
          endReason: g.endReason,
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

    leaveRoom: () => {
      // Keep the hub subscription — staying in the group is harmless and avoids a
      // half-connected client that can send moves but receives nothing back.
      set({ seat: null, roomCode: null })
    },

    selectSquare: (c) => {
      const { board, turn, status, busy, seat, ruleset } = get()
      if (!board || busy || !canAct(seat, turn, status)) return
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

    resign: async () => {
      const { gameId, seat } = get()
      if (!gameId || (seat !== 'P1' && seat !== 'P2')) return
      try {
        await apiResignGame(gameId, seat)
      } catch {
        /* expected/benign — see the `resign` doc on GameStore. */
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
          endReason: g.endReason,
          ...clockFields(g),
        })
      } catch {
        /* a failed resync just leaves the last-known state; the next push corrects it */
      }
    },

    reconnectRealtime: () => {
      // The hub connection captured the auth token (or lack of one) at connect time; a login
      // or logout mid-game needs a fresh connection for accessTokenFactory to pick it up.
      const { gameId } = get()
      if (!gameId) return
      void unfollow().then(() => startFollowing(gameId))
    },

    dismissError: () => set({ error: null }),
  }
})
