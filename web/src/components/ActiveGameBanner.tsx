import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Player } from '../api/types'
import { canAct, hasActiveGame, seatStatus } from '../game/turnLock'
import { useGame } from '../store'
import { ClockFace } from './GameClock'
import { useGameClocks } from './GameClockContext'
import { useResignConfirm } from './useResignConfirm'

/** How long the "it's your turn now" highlight stays up before settling back down. */
const MY_TURN_PULSE_MS = 1_200

/**
 * Persistent "you have a game in progress" banner, mounted once in `AppLayout` next to
 * `PendingInvitesTray` (same always-mounted, store-state-keyed pattern) so a match stays visible
 * from anywhere in the app now that "Leave" is gone — resignation is the only way to end a game
 * early, so a player who's navigated away needs a way back in (and a way to concede) without
 * first finding `/play` again. Covers every in-progress game — room, local hotseat, and bot alike
 * — via `hasActiveGame`, not just a seated room game. Hidden on any `/play*` route, since
 * `PlayScreen` (and `InvitePlayScreen`/`PlayHubScreen`) already show this information directly.
 */
export function ActiveGameBanner() {
  const location = useLocation()
  const navigate = useNavigate()

  const gameId = useGame((s) => s.gameId)
  const status = useGame((s) => s.status)
  const seat = useGame((s) => s.seat)
  const turn = useGame((s) => s.turn)
  const isLocal = useGame((s) => s.isLocal)
  const botSeat = useGame((s) => s.botSeat)
  const botDifficulty = useGame((s) => s.botDifficulty)
  const p1Profile = useGame((s) => s.p1Profile)
  const p2Profile = useGame((s) => s.p2Profile)

  const clocks = useGameClocks()

  const active = hasActiveGame(gameId, status, seat)
  const onPlayRoute = location.pathname.startsWith('/play')
  const myTurn = active && canAct(seat, turn, status, botSeat)
  const canResign = active && (seat === 'P1' || seat === 'P2' || isLocal || botSeat !== null)
  const { armed, handleClick, handleBlur } = useResignConfirm(canResign)

  // Fire the highlight only on the false -> true edge (an actual "it's your turn now" moment),
  // never on every render while it's already my turn — a ref (not state) tracks the previous
  // value so reading it doesn't itself trigger a re-render.
  const [justBecameMyTurn, setJustBecameMyTurn] = useState(false)
  const prevMyTurn = useRef(myTurn)
  useEffect(() => {
    if (myTurn && !prevMyTurn.current) {
      setJustBecameMyTurn(true)
      const id = setTimeout(() => setJustBecameMyTurn(false), MY_TURN_PULSE_MS)
      prevMyTurn.current = myTurn
      return () => clearTimeout(id)
    }
    prevMyTurn.current = myTurn
  }, [myTurn])

  if (!active || onPlayRoute) return null

  // Same "which side is you" derivation PlayScreen uses (`mySeat`), extended to a bot game's one
  // human seat — the seat botSeat doesn't occupy. Stays null for local play (both sides are you,
  // and local play is always untimed anyway, so there's no clock to pick a side for).
  const mySeat: Player | null =
    seat === 'P1' || seat === 'P2' ? seat : botSeat !== null ? (botSeat === 'P1' ? 'P2' : 'P1') : null
  const clock = mySeat ? clocks[mySeat] : null

  const opponentLabel = isLocal
    ? 'Local game'
    : botSeat !== null
      ? `vs Bot${botDifficulty ? ` (${botDifficulty})` : ''}`
      : (() => {
          const opponent = mySeat === 'P1' ? p2Profile : mySeat === 'P2' ? p1Profile : null
          return opponent ? `vs ${opponent.displayName}` : 'vs opponent'
        })()

  // seatStatus only covers a seated room player (empty for solo play — see its own doc); local
  // and bot games need their own text since neither has a room seat to key off of.
  const statusLabel = isLocal ? 'In progress' : botSeat !== null ? (myTurn ? 'Your turn' : 'Bot is thinking…') : seatStatus(seat, turn, status)

  return (
    <div
      data-testid="active-game-banner"
      className={[
        'mx-3 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors sm:mx-4',
        justBecameMyTurn ? 'animate-pulse border-accent bg-accent/10' : 'border-border bg-surface-raised',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-text">{opponentLabel}</span>
        <span className={myTurn ? 'text-xs font-semibold text-accent' : 'text-xs text-text-muted'}>{statusLabel}</span>
        {clock?.remainingMs !== null && clock && mySeat && (
          <ClockFace player={mySeat} active={myTurn} isDaily={clock.isDaily} remainingMs={clock.remainingMs} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/play')}
          className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent/90"
        >
          View game
        </button>
        {canResign && (
          <button
            type="button"
            onClick={handleClick}
            onBlur={handleBlur}
            className={[
              'rounded px-2.5 py-1 text-xs font-medium shadow-sm transition-colors',
              armed
                ? 'bg-danger text-danger-fg hover:bg-danger/90'
                : 'bg-surface-raised text-danger ring-1 ring-border hover:bg-surface',
            ].join(' ')}
          >
            {armed ? 'Confirm resign?' : 'Resign'}
          </button>
        )}
      </div>
    </div>
  )
}
