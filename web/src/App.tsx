import { useEffect } from 'react'
import { Board } from './components/Board'
import { pieceAt } from './game/board'
import { canRotate } from './game/rules'
import { useGame } from './store'

export default function App() {
  const status = useGame((s) => s.status)
  const turn = useGame((s) => s.turn)
  const moveCount = useGame((s) => s.moveCount)
  const gameId = useGame((s) => s.gameId)
  const board = useGame((s) => s.board)
  const busy = useGame((s) => s.busy)
  const error = useGame((s) => s.error)
  const selected = useGame((s) => s.selected)
  const newGame = useGame((s) => s.newGame)
  const rotateSelected = useGame((s) => s.rotateSelected)
  const dismissError = useGame((s) => s.dismissError)

  const selectedPiece = board && selected ? pieceAt(board, selected) : undefined
  const canRotateSelected = selectedPiece ? canRotate(selectedPiece) : false

  // First mount: resume the game named in the URL, else start a fresh one.
  // Guarded so React StrictMode's double-invoke doesn't create an orphan game.
  useEffect(() => {
    const { gameId: existing, busy: loading } = useGame.getState()
    if (existing || loading) return
    const fromUrl = new URLSearchParams(window.location.search).get('game')
    if (fromUrl) void useGame.getState().loadGame(fromUrl)
    else void useGame.getState().newGame()
  }, [])

  // Keep the game id in the URL so a refresh resumes the same game.
  useEffect(() => {
    if (!gameId) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('game') !== gameId) {
      url.searchParams.set('game', gameId)
      window.history.replaceState(null, '', url)
    }
  }, [gameId])

  // Q / E rotate the selected piece.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!canRotateSelected || busy) return
      if (e.key === 'q' || e.key === 'Q') void rotateSelected('CCW')
      if (e.key === 'e' || e.key === 'E') void rotateSelected('CW')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canRotateSelected, busy, rotateSelected])

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
              onClick={() => void newGame()}
              disabled={busy}
              className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600 disabled:opacity-50"
            >
              New game
            </button>
          </div>
        </header>

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
          <div className="mt-3 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => void rotateSelected('CCW')}
              disabled={busy}
              className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600 disabled:opacity-50"
            >
              ⟲ rotate CCW (Q)
            </button>
            <button
              type="button"
              onClick={() => void rotateSelected('CW')}
              disabled={busy}
              className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600 disabled:opacity-50"
            >
              ⟳ rotate CW (E)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
