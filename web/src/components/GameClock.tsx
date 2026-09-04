import { useEffect, useRef, useState } from 'react'
import { findTimeControlPreset } from '../game/timeControls'
import { useGame } from '../store'

/** Below this many ms remaining, a live (non-Daily) clock gets the low-time red treatment. */
const LOW_TIME_MS = 20_000
/** How often the local display tick recomputes while a live clock is running. */
const TICK_MS = 250

function formatLiveClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDailyLabel(ms: number): string {
  if (ms <= 0) return 'time up'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  if (days > 0) return `${days}d ${hours}h left`
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`
}

/**
 * Display-only local tick: a `setInterval` recomputes `Date.now() + serverOffsetMs` every
 * `TICK_MS` while `running` and stores it in state purely for display — never written back to
 * the store. `serverOffsetMs` is read through a ref inside the interval callback (rather than
 * captured in the effect's closure) so a fresh offset from the next server payload is picked up
 * on the very next tick without needing to restart the interval. See `api/types.ts`'s
 * `GameResponse.serverNowUtc` doc for why ticking against `Date.now()` alone would be wrong.
 */
function useClockTick(running: boolean, serverOffsetMs: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now() + serverOffsetMs)
  const offsetRef = useRef(serverOffsetMs)

  useEffect(() => {
    offsetRef.current = serverOffsetMs
  }, [serverOffsetMs])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNowMs(Date.now() + offsetRef.current), TICK_MS)
    return () => clearInterval(id)
  }, [running])

  return nowMs
}

/**
 * Two time displays (P1/P2), active side highlighted, low-time treatment for live controls.
 * Renders nothing when the game has no time control (untimed room, or local/solo play, which
 * stays clockless). Slots into `RoomStatusBar`, next to the existing seat/turn status.
 *
 * "Snap to server, animate the delta": the store holds server truth only (`p1RemainingMs`,
 * `turnDeadlineUtc`, `serverOffsetMs`, ...), snapped in the move-result handler's immediate
 * phase — this component's `useClockTick` is purely a display-only local interval that never
 * writes back to the store, so it can't drift the store away from what the server last said.
 *
 * Only the side on turn actually ticks (its deadline counts down); the side not on turn shows
 * its static banked remaining time, matching how the server computes `turnDeadlineUtc` — see
 * the plan's clock-mechanics section.
 */
export function GameClock() {
  const timeControl = useGame((s) => s.timeControl)
  const status = useGame((s) => s.status)
  const turn = useGame((s) => s.turn)
  const p1RemainingMs = useGame((s) => s.p1RemainingMs)
  const p2RemainingMs = useGame((s) => s.p2RemainingMs)
  const turnDeadlineUtc = useGame((s) => s.turnDeadlineUtc)
  const serverOffsetMs = useGame((s) => s.serverOffsetMs)
  const gameId = useGame((s) => s.gameId)
  const claimTimeout = useGame((s) => s.claimTimeout)

  const preset = findTimeControlPreset(timeControl)
  const isDaily = preset !== null && preset.daysPerMove !== null
  const isLive = preset !== null && !isDaily
  // Only a live clock needs a running interval; Daily's label is "re-rendered lazily" per the
  // plan — computed once per mount/serverOffset change, not on a fast tick.
  const ticking = isLive && status === 'InProgress'
  const nowMs = useClockTick(ticking, serverOffsetMs)

  // Zero-reached -> claim-timeout, exactly once per deadline. Keyed on the deadline itself so a
  // new deadline (after a move, or Daily's per-move reset) always gets a fresh chance to claim.
  const claimedDeadline = useRef<string | null>(null)
  useEffect(() => {
    if (status !== 'InProgress' || !turnDeadlineUtc || !gameId) return
    if (nowMs < new Date(turnDeadlineUtc).getTime()) return
    if (claimedDeadline.current === turnDeadlineUtc) return
    claimedDeadline.current = turnDeadlineUtc
    void claimTimeout()
  }, [status, turnDeadlineUtc, nowMs, gameId, claimTimeout])

  if (!preset) return null

  function remainingFor(player: 'P1' | 'P2'): number | null {
    const banked = player === 'P1' ? p1RemainingMs : p2RemainingMs
    if (player !== turn || !turnDeadlineUtc || status !== 'InProgress') return banked
    return Math.max(0, new Date(turnDeadlineUtc).getTime() - nowMs)
  }

  return (
    <div className="flex items-center gap-2" data-testid="game-clock">
      <ClockFace player="P1" active={turn === 'P1'} isDaily={isDaily} remainingMs={remainingFor('P1')} />
      <span className="text-slate-600">–</span>
      <ClockFace player="P2" active={turn === 'P2'} isDaily={isDaily} remainingMs={remainingFor('P2')} />
    </div>
  )
}

function ClockFace({
  player,
  active,
  isDaily,
  remainingMs,
}: {
  player: 'P1' | 'P2'
  active: boolean
  isDaily: boolean
  remainingMs: number | null
}) {
  const lowTime = !isDaily && remainingMs !== null && remainingMs <= LOW_TIME_MS
  const label =
    remainingMs === null ? '—' : isDaily ? formatDailyLabel(remainingMs) : formatLiveClock(remainingMs)

  return (
    <span
      data-testid={`clock-${player}`}
      title={player === 'P1' ? 'Silver (P1)' : 'Red (P2)'}
      className={[
        'rounded px-2 py-1 text-sm font-semibold tabular-nums',
        active ? 'bg-slate-700 text-white' : 'text-slate-400',
        lowTime ? 'text-rose-400' : '',
      ].join(' ')}
    >
      {label}
    </span>
  )
}
