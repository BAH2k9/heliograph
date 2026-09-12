import { useEffect } from 'react'
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import type { Player } from '../api/types'
import { Board } from '../components/Board'
import { DisconnectBanner } from '../components/DisconnectBanner'
import { useClockAutoClaim } from '../components/GameClock'
import { Logo } from '../components/Logo'
import { PlayAgainButton } from '../components/PlayAgainButton'
import { PlayerCard } from '../components/PlayerCard'
import { ResignButton } from '../components/ResignButton'
import { RoomStatusBar } from '../components/RoomStatusBar'
import type { PlayOutletContext } from '../layout/AppLayout'
import { Button } from '../ui/Button'
import { pieceAt } from '../game/board'
import { canRotate } from '../game/rules'
import { applyRoomParams, readRoomParams } from '../game/roomUrl'
import { useGame } from '../store'

export function PlayScreen() {
  const { openSettings, settingsOpen } = useOutletContext<PlayOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()

  const turn = useGame((s) => s.turn)
  const moveCount = useGame((s) => s.moveCount)
  const gameId = useGame((s) => s.gameId)
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const isLocal = useGame((s) => s.isLocal)
  const board = useGame((s) => s.board)
  const busy = useGame((s) => s.busy)
  const selected = useGame((s) => s.selected)
  const rotateSelected = useGame((s) => s.rotateSelected)
  const p1Profile = useGame((s) => s.p1Profile)
  const p2Profile = useGame((s) => s.p2Profile)
  const botSeat = useGame((s) => s.botSeat)
  const status = useGame((s) => s.status)

  // The one mounted instance of the ticking/auto-claim-timeout side effect — see its doc for why
  // this must never be duplicated inside each `PlayerCard`.
  const clocks = useClockAutoClaim()

  const selectedPiece = board && selected ? pieceAt(board, selected) : undefined
  const canRotateSelected = selectedPiece ? canRotate(selectedPiece) : false

  // The bot's move is computed server-side with a deliberate ~0.5-1.5s "thinking" delay (see
  // `plans/08-bot-opponent.md`) — `turn` flips to `botSeat` the moment the human's own move lands
  // (via the hub's first `moveApplied` push) and stays there until the bot's reply arrives as a
  // second push, so this is a direct read of store state, no separate timer needed.
  const botThinking = botSeat !== null && turn === botSeat && status === 'InProgress'

  // Card positions are fixed by piece colour, not by which seat you hold: Red (P2) always top,
  // Silver (P1) always bottom, both flush-left. `mySeat` only decides the null-profile fallback
  // label (see `PlayerCard`'s `isYou` doc); a spectator / local player treats both as "you".
  const mySeat: Player | null = seat === 'P1' || seat === 'P2' ? seat : null

  function playerCard(cardSeat: Player) {
    return (
      <PlayerCard
        seat={cardSeat}
        profile={cardSeat === 'P1' ? p1Profile : p2Profile}
        isYou={mySeat === null || cardSeat === mySeat}
        active={turn === cardSeat}
        clock={clocks[cardSeat]}
        showRating={!isLocal}
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

  return (
    <div className="min-h-screen min-h-dvh bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <Logo withWordmark size="sm" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <RoomStatusBar />
            {botThinking && (
              <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Bot is thinking…
              </span>
            )}
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

        <DisconnectBanner />

        {/* Board and its two player strips read as one unit. Cards sit at fixed positions —
            Red (P2) top, Silver (P1) bottom, both flush-left — and appear for room play and
            Local Play alike (bot/solo-without-a-name games still have no cards). Resign floats
            at the board's top-right; once the game ends and the win dialog has been dismissed,
            `PlayAgainButton` takes over that same slot (the two never render at once — one needs
            `InProgress`, the other needs a decided `status`) so a rematch doesn't require
            reopening the dialog. */}
        <div className="flex flex-col gap-2">
          {(roomCode || isLocal) && (
            <div className="flex items-start justify-between gap-2">
              {playerCard('P2')}
              <ResignButton className="mt-0.5 shrink-0" />
              <PlayAgainButton className="mt-0.5 shrink-0" />
            </div>
          )}

          {board ? <Board /> : <p className="text-text-muted">Loading…</p>}

          {(roomCode || isLocal) && playerCard('P1')}
        </div>

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
      {/* Canonical Feather Icons "settings" path — the hand-simplified version this replaced
          collapsed one tooth's arc pair into a plain curve, which is why it read as lopsided. */}
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
