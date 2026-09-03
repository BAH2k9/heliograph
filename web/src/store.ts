import { create } from 'zustand'
import type { Coord, GameStatus, MoveRequest, Player, RotationDir } from './api/types'
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
import { beamDurationMs, beamPoints, type Point } from './game/laser'
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

  selected: Coord | null
  legalTargets: Coord[]

  /** A request is in flight or the move/laser/death animation is playing — input is locked. */
  busy: boolean
  error: string | null

  /** Non-null while the bullet is in flight. */
  beam: Beam | null
  /** Piece ids currently playing their destruction animation. */
  dying: string[]

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const useGame = create<GameStore>((set, get) => {
  async function submit(move: MoveRequest): Promise<void> {
    const { gameId, board } = get()
    if (!gameId || !board) return

    set({ busy: true, error: null })
    const res = await submitMove(gameId, move)

    if (!res.ok) {
      // The client mirror let this through but the server refused it — trust the server.
      set({ busy: false })
      await get().loadGame(gameId)
      set({ error: res.error })
      return
    }

    const { data } = res

    // The board the laser fired into (move applied, nothing destroyed yet) keeps piece ids.
    const movedBoard = applyMove(board, move)
    let settledBoard = applyLaserResult(movedBoard, data.eliminated, data.damaged)
    if (!matchesServer(settledBoard, data.boardState)) settledBoard = identify(data.boardState)

    const dyingIds = movedBoard.pieces
      .filter((p) => data.eliminated.some((e) => e.row === p.row && e.col === p.col))
      .map((p) => p.id)

    const points = beamPoints(data.laserSegments)
    const { laser, animation } = useDisplaySettings.getState()

    // 1. piece slides to its new square; turn/status update now, input stays locked.
    set({
      board: movedBoard,
      selected: null,
      legalTargets: [],
      turn: data.currentTurn,
      status: data.status,
      moveCount: data.moveNumber,
      beam: null,
      dying: [],
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

  const freshGameState: Partial<GameStore> = {
    selected: null,
    legalTargets: [],
    beam: null,
    dying: [],
    busy: false,
    error: null,
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
    beam: null,
    dying: [],

    newGame: async () => {
      if (get().busy) return
      set({ busy: true, error: null })
      try {
        const g = await createGame()
        set({
          ...freshGameState,
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
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
          ...freshGameState,
          gameId: g.id,
          board: identify(g.boardState),
          turn: g.currentTurn,
          status: g.status,
          moveCount: g.moveCount,
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
