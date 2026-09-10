import { useEffect } from 'react'
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import type { Player } from '../api/types'
import { Board } from '../components/Board'
import { useClockAutoClaim } from '../components/GameClock'
import { Logo } from '../components/Logo'
import { PlayerCard } from '../components/PlayerCard'
import { RoomStatusBar } from '../components/RoomStatusBar'
import type { PlayOutletContext } from '../layout/AppLayout'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { pieceAt } from '../game/board'
import { canRotate } from '../game/rules'
import { applyRoomParams, readRoomParams } from '../game/roomUrl'
import { useGame } from '../store'

export function PlayScreen() {
  const { openSettings, settingsOpen } = useOutletContext<PlayOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()

  const status = useGame((s) => s.status)
  const turn = useGame((s) => s.turn)
  const moveCount = useGame((s) => s.moveCount)
  const gameId = useGame((s) => s.gameId)
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const board = useGame((s) => s.board)
  const busy = useGame((s) => s.busy)
  const selected = useGame((s) => s.selected)
  const rotateSelected = useGame((s) => s.rotateSelected)
  const p1Profile = useGame((s) => s.p1Profile)
  const p2Profile = useGame((s) => s.p2Profile)

  // The one mounted instance of the ticking/auto-claim-timeout side effect — see its doc for why
  // this must never be duplicated inside each `PlayerCard`.
  const clocks = useClockAutoClaim()

  const selectedPiece = board && selected ? pieceAt(board, selected) : undefined
  const canRotateSelected = selectedPiece ? canRotate(selectedPiece) : false

  // Which seat is physically "yours" (bottom card) vs. the opponent's (top card). Only rendered
  // for room play (guarded on `roomCode` below) — local/solo play has no separate opponent to
  // show a card for. A spectator has no real seat of their own either (`seat` is `'Spectator'`) —
  // default to the ordinary P2-top/P1-bottom layout and treat neither card as "the opponent" (see
  // `PlayerCard`'s `isYou` doc). This is purely about card *order*, not the board's own
  // orientation — that stays untouched (out of scope per the plan).
  const mySeat: Player | null = seat === 'P1' || seat === 'P2' ? seat : null
  const opponentSeat: Player | null = mySeat === null ? null : mySeat === 'P1' ? 'P2' : 'P1'
  const bottomSeat: Player = mySeat === 'P2' ? 'P2' : 'P1'
  const topSeat: Player = bottomSeat === 'P1' ? 'P2' : 'P1'

  function playerCard(cardSeat: Player) {
    return (
      <PlayerCard
        seat={cardSeat}
        profile={cardSeat === 'P1' ? p1Profile : p2Profile}
        isYou={cardSeat !== opponentSeat}
        active={turn === cardSeat}
        clock={clocks[cardSeat]}
      />
    )
  }

  // First mount: resume the game (and room seat) named in the URL. Guarded so React
  // StrictMode's double-invoke doesn't create an orphan game.
  useEffect(() => {
    const { gameId: existing, busy: loading } = useGame.getState()
    if (existing || loading) return
    const { gameId: fromUrl, seat: seatFromUrl, code } = readRoomParams(window.location.search)
    if (!fromUrl) return
    if (seatFromUrl) {
      if (code) useGame.setState({ roomCode: code })
      void useGame.getState().loadGame(fromUrl, seatFromUrl)
    } else {
      void useGame.getState().loadGame(fromUrl)
    }
  }, [])

  // Keep game id / seat / room code in the URL so a refresh resumes the same session.
  useEffect(() => {
    if (!gameId) return
    const url = applyRoomParams(new URL(window.location.href), { gameId, seat, code: roomCode })
    if (url.search !== window.location.search) setSearchParams(url.searchParams, { replace: true })
  }, [gameId, seat, roomCode, setSearchParams])

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

  // Reached directly with nothing to resume and no live game — there's nothing to play.
  if (!gameId && !searchParams.get('game')) return <Navigate to="/" replace />

  const banner =
    status === 'P1Win'
      ? 'Silver (P1) wins'
      : status === 'P2Win'
        ? 'Red (P2) wins'
        : `${turn === 'P1' ? 'Silver (P1)' : 'Red (P2)'} to move`

  const won = status === 'P1Win' || status === 'P2Win'

  return (
    <div className="min-h-screen bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        <header className="flex items-center justify-between">
          <Logo withWordmark size="sm" />
          <div className="flex items-center gap-2 text-sm">
            <span className="tabular-nums text-text-subtle">move {moveCount}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={openSettings}
              aria-label="Settings"
              title="Settings"
              className="px-2"
            >
              <SettingsIcon />
            </Button>
          </div>
        </header>

        <RoomStatusBar />

        {/* Player cards are a room-play concept — local/solo play has no separate "opponent" to
            identify, and would otherwise show two identical unclaimed "Guest" strips. */}
        {roomCode && playerCard(topSeat)}

        <div className="flex items-center gap-2 text-sm font-medium" data-testid="status-banner">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              won ? 'bg-accent' : turn === 'P1' ? 'bg-text' : 'bg-danger',
            )}
          />
          {banner}
        </div>

        {board ? <Board /> : <p className="text-text-muted">Loading…</p>}

        {roomCode && playerCard(bottomSeat)}

        {canRotateSelected && (
          <p className="text-xs text-text-subtle">
            Rotate with the arrows on the piece, or press Q / E.
          </p>
        )}
      </div>
    </div>
  )
}

function SettingsIcon() {
  return (
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
  )
}
