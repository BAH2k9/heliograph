import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'

/** Server's own grace window before `claim-abandonment` succeeds (see
 *  `plans/02-disconnect-abandonment.md`'s wire contract) — mirrored here only for the countdown
 *  display and the auto-claim trigger; the server re-checks its own tracked timestamp
 *  authoritatively rather than trusting this client's clock. */
const GRACE_MS = 45_000
/** How often the local countdown display re-renders while counting down. */
const TICK_MS = 250

/**
 * Display-only local tick: recomputes `Date.now() + serverOffsetMs` every `TICK_MS` while
 * `running`, purely for display — never written back to the store. Same idiom as
 * `GameClock.tsx`'s `useClockTick` (see its doc for why ticking against `Date.now()` alone,
 * without the server offset, would be wrong).
 */
function useTick(running: boolean, serverOffsetMs: number): number {
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
 * Shown while the *other* seat's connection has been observed dropped mid-game: a countdown to
 * when `claimAbandonment()` becomes claimable, then a manual "Claim win" button. Auto-fires
 * `claimAbandonment()` at zero exactly like `GameClock.tsx`'s `claimedDeadline` ref+effect
 * auto-fires `claimTimeout()` — same idiom, reused rather than reinvented.
 *
 * Renders nothing for a spectator (no seat of its own to claim with — `seat` is only `"P1"` or
 * `"P2"` here), for the game's own not-in-progress state, or while nothing is tracked
 * disconnected.
 */
export function DisconnectBanner() {
  const seat = useGame((s) => s.seat)
  const status = useGame((s) => s.status)
  const p1DisconnectedAtUtc = useGame((s) => s.p1DisconnectedAtUtc)
  const p2DisconnectedAtUtc = useGame((s) => s.p2DisconnectedAtUtc)
  const serverOffsetMs = useGame((s) => s.serverOffsetMs)
  const gameId = useGame((s) => s.gameId)
  const claimAbandonment = useGame((s) => s.claimAbandonment)

  // Only the *other* seat's disconnect is actionable from here — a seat can't claim against
  // its own dropped connection, and a spectator (seat is null/"Spectator") has no seat to claim.
  const opponentSeat = seat === 'P1' ? 'P2' : seat === 'P2' ? 'P1' : null
  const disconnectedAtUtc =
    opponentSeat === 'P1' ? p1DisconnectedAtUtc : opponentSeat === 'P2' ? p2DisconnectedAtUtc : null

  const deadlineMs = disconnectedAtUtc ? new Date(disconnectedAtUtc).getTime() + GRACE_MS : null
  const running = status === 'InProgress' && deadlineMs !== null
  const nowMs = useTick(running, serverOffsetMs)

  // Fire-once-per-disconnect, keyed on the disconnect timestamp itself so a later reconnect +
  // fresh disconnect always gets its own chance to claim.
  const claimedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!running || deadlineMs === null || !gameId || !disconnectedAtUtc) return
    if (nowMs < deadlineMs) return
    if (claimedFor.current === disconnectedAtUtc) return
    claimedFor.current = disconnectedAtUtc
    void claimAbandonment()
  }, [running, deadlineMs, nowMs, gameId, disconnectedAtUtc, claimAbandonment])

  if (!opponentSeat || !disconnectedAtUtc || status !== 'InProgress' || deadlineMs === null) return null

  const remainingMs = Math.max(0, deadlineMs - nowMs)
  const claimable = remainingMs <= 0

  return (
    <div
      className="mb-3 flex items-center gap-3 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning"
      data-testid="disconnect-banner"
    >
      <span>
        {claimable ? 'Opponent disconnected' : `Opponent disconnected — claimable in ${Math.ceil(remainingMs / 1000)}s`}
      </span>
      {claimable && (
        <button
          type="button"
          onClick={() => void claimAbandonment()}
          className="rounded bg-warning px-2 py-1 text-xs font-medium text-surface hover:bg-warning/90"
        >
          Claim win
        </button>
      )}
    </div>
  )
}
