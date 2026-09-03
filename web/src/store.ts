import { create } from 'zustand'
import type {
  Coord,
  GameStatus,
  LaserSegment,
  MoveRequest,
  Player,
  RotationDir,
} from './api/types'
import { createGame, getGame, submitMove } from './api/client'
import {
  applyLaserResult,
  applyMove,
  identify,
  matchesServer,
  pieceAt,
  type ClientBoard,
} from './game/board'
import { legalDestinations } from './game/rules'

interface GameStore {
  gameId: string | null
  board: ClientBoard | null
  turn: Player
  status: GameStatus
  moveCount: number

  selected: Coord | null
  legalTargets: Coord[]

  /** A request is in flight (or, later, an animation is playing) — input is locked. */
  busy: boolean
  error: string | null
  /** The most recently fired beam, for the laser layer. */
  lastLaser: LaserSegment[] | null

  newGame: () => Promise<void>
  loadGame: (id: string) => Promise<void>
  selectSquare: (c: Coord) => void
  clearSelection: () => void
  moveTo: (to: Coord) => Promise<void>
  rotateSelected: (dir: RotationDir) => Promise<void>
  dismissError: () => void
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export const useGame = create<GameStore>((set, get) => {
  async function submit(move: MoveRequest): Promise<void> {
    const { gameId, board } = get()
    if (!gameId || !board) return

    set({ busy: true, error: null })
    const res = await submitMove(gameId, move)

    if (!res.ok) {
      // The client mirror let this through but the server refused it — trust the server.
      await get().loadGame(gameId)
      set({ error: res.error, busy: false })
      return
    }

    const { data } = res
    let next = applyLaserResult(applyMove(board, move), data.eliminated, data.damaged)
    if (!matchesServer(next, data.boardState)) next = identify(data.boardState)

    set({
      board: next,
      turn: data.currentTurn,
      status: data.status,
      moveCount: data.moveNumber,
      selected: null,
      legalTargets: [],
      lastLaser: data.laserSegments,
      busy: false,
    })
  }

  return {
    gameId: null,
    board: null,
    turn: 'P1',
    status: 'InProgress',
    moveCount: 0,
    selected: null,
    legalTargets: [],
    busy: false,
    error: null,
    lastLaser: null,

    newGame: async () => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const g = await createGame()
        set({
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
          selected: null,
          legalTargets: [],
          lastLaser: null,
          busy: false,
        })
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    loadGame: async (id) => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const g = await getGame(id)
        set({
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
          selected: null,
          legalTargets: [],
          lastLaser: null,
          busy: false,
        })
      } catch (e) {
        set({ busy: false, error: errorText(e) })
      }
    },

    selectSquare: (c) => {
      const { board, turn, status, busy } = get()
      if (!board || busy || status !== 'InProgress') return
      const piece = pieceAt(board, c)
      if (!piece || piece.owner !== turn) {
        set({ selected: null, legalTargets: [] })
        return
      }
      set({ selected: c, legalTargets: legalDestinations(board, c, turn) })
    },

    clearSelection: () => set({ selected: null, legalTargets: [] }),

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

    dismissError: () => set({ error: null }),
  }
})
