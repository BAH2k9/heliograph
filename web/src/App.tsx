import { useEffect, useState } from 'react'
import { Board } from './components/Board'
import { NewGameDialog } from './components/NewGameDialog'
import { RoomBar } from './components/RoomBar'
import { SettingsDialog } from './components/SettingsDialog'
import { WinOverlay } from './components/WinOverlay'
import { pieceAt } from './game/board'
import { canRotate } from './game/rules'
import { applyRoomParams, readRoomParams } from './game/roomUrl'
import { useGame } from './store'

export default function App() {
  const status = useGame((s) => s.status)
  const turn = useGame((s) => s.turn)
  const moveCount = useGame((s) => s.moveCount)
  const gameId = useGame((s) => s.gameId)
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const board = useGame((s) => s.board)
  const busy = useGame((s) => s.busy)
  const error = useGame((s) => s.error)
  const selected = useGame((s) => s.selected)
  const ruleset = useGame((s) => s.ruleset)
  const layout = useGame((s) => s.layout)
  const newGame = useGame((s) => s.newGame)
  const createRoom = useGame((s) => s.createRoom)
  const rotateSelected = useGame((s) => s.rotateSelected)
  const dismissError = useGame((s) => s.dismissError)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setup, setSetup] = useState<null | 'game' | 'room'>(null)

  const selectedPiece = board && selected ? pieceAt(board, selected) : undefined
  const canRotateSelected = selectedPiece ? canRotate(selectedPiece) : false

  // First mount: resume the game (and room seat) named in the URL, else start a fresh one.
  // Guarded so React StrictMode's double-invoke doesn't create an orphan game.
  useEffect(() => {
    const { gameId: existing, busy: loading } = useGame.getState()
    if (existing || loading) return
    const { gameId: fromUrl, seat: seatFromUrl, code } = readRoomParams(window.location.search)
    if (fromUrl && seatFromUrl) {
      if (code) useGame.setState({ roomCode: code })
      void useGame.getState().loadGame(fromUrl, seatFromUrl)
    } else if (fromUrl) {
      void useGame.getState().loadGame(fromUrl)
    } else {
      void useGame.getState().newGame()
    }
  }, [])

  // Keep game id / seat / room code in the URL so a refresh resumes the same session.
  useEffect(() => {
    if (!gameId) return
    const url = applyRoomParams(new URL(window.location.href), { gameId, seat, code: roomCode })
    if (url.search !== window.location.search) window.history.replaceState(null, '', url)
  }, [gameId, seat, roomCode])

  // Q / E rotate the selected piece.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (settingsOpen || !canRotateSelected || busy) return
      if (e.key === 'q' || e.key === 'Q') void rotateSelected('CCW')
      if (e.key === 'e' || e.key === 'E') void rotateSelected('CW')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, canRotateSelected, busy, rotateSelected])

  const banner =
    status === 'P1Win'
      ? 'Silver (P1) wins'
      : status === 'P2Win'
        ? 'Red (P2) wins'
        : `${turn === 'P1' ? 'Silver (P1)' : 'Red (P2)'} to move`

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Khet</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-slate-400">move {moveCount}</span>
            <button
              type="button"
              onClick={() => setSetup('game')}
              disabled={busy || seat !== null}
              title={seat !== null ? 'Leave the room to start a new game' : undefined}
              className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600 disabled:opacity-50"
            >
              New game
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1s-.08.69-.22 1z" />
              </svg>
            </button>
          </div>
        </header>

        <RoomBar onCreateRoom={() => setSetup('room')} />

        <p className="mb-3 text-sm font-medium" data-testid="status-banner">
          {banner}
        </p>

        {error && (
          <div className="mb-3 flex items-center justify-between rounded bg-rose-900/60 px-3 py-2 text-sm text-rose-100">
            <span>{error}</span>
            <button type="button" onClick={dismissError} className="ml-4 underline">
              dismiss
            </button>
          </div>
        )}

        {board ? <Board /> : <p className="text-slate-400">Loading…</p>}

        {canRotateSelected && (
          <p className="mt-3 text-xs text-slate-500">
            Rotate with the arrows on the piece, or press Q / E.
          </p>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewGameDialog
        key={setup ?? 'closed'}
        open={setup !== null}
        actionLabel={setup === 'room' ? 'Create room' : 'New game'}
        initialRuleset={ruleset}
        initialLayout={layout}
        onConfirm={(opts) => {
          if (setup === 'room') void createRoom(opts)
          else void newGame(opts)
          setSetup(null)
        }}
        onClose={() => setSetup(null)}
      />
      <WinOverlay key={gameId ?? 'none'} />
    </div>
  )
}
