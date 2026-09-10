import { useState } from 'react'
import { ApiError, claimSeat } from '../api/client'
import { useAuth } from '../authStore'
import { Button } from '../ui/Button'
import { useGame } from '../store'

/**
 * The room's out-of-the-way controls, tucked into the `PlayScreen` header: the shareable code
 * (click to copy), a rated marker, an optional "claim this seat for my account" action, and the
 * way out. Whose-turn / which-seat state lives on the two `PlayerCard`s now, not here. Renders
 * nothing outside a room.
 */
export function RoomStatusBar() {
  const gameId = useGame((s) => s.gameId)
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const rated = useGame((s) => s.rated)
  const p1Claimed = useGame((s) => s.p1Claimed)
  const p2Claimed = useGame((s) => s.p2Claimed)
  const leaveRoom = useGame((s) => s.leaveRoom)
  const resync = useGame((s) => s.resync)
  const user = useAuth((s) => s.user)

  const [copied, setCopied] = useState(false)
  const [claim, setClaim] = useState<{ state: 'idle' | 'busy' | 'claimed' | 'error'; error?: string }>({
    state: 'idle',
  })

  if (!seat) return null

  // Already claimed server-side (e.g. from an earlier session, or a page reload) as well as
  // this session's own just-succeeded claim both hide the prompt.
  const seatAlreadyClaimed = seat === 'P1' ? p1Claimed : seat === 'P2' ? p2Claimed : true
  // Anonymous room play stays fully functional; claiming just attaches an account after the
  // fact so the game shows up in that account's archive. Spectators have no seat to claim, and
  // the endpoint 400s for a non-room game (no JoinCode), so gate on roomCode too.
  const canClaim =
    user !== null &&
    gameId !== null &&
    roomCode !== null &&
    (seat === 'P1' || seat === 'P2') &&
    claim.state !== 'claimed' &&
    !seatAlreadyClaimed

  async function doClaim() {
    if (!gameId || (seat !== 'P1' && seat !== 'P2')) return
    setClaim({ state: 'busy' })
    try {
      await claimSeat(gameId, seat)
      setClaim({ state: 'claimed' })
      // p1Profile/p2Profile only ever come from a GameResponse (GET), never from claimSeat's own
      // response — refresh so the newly-claimed account's name/avatar/rating show up on its
      // PlayerCard immediately instead of waiting for the next unrelated load/resync.
      void resync()
    } catch (e) {
      setClaim({ state: 'error', error: e instanceof ApiError ? e.detail : String(e) })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {roomCode && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(roomCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="rounded bg-white/5 px-2 py-1 font-mono text-xs tracking-widest text-text-muted transition-colors hover:bg-white/10 hover:text-text"
          title="Copy room code"
        >
          {copied ? 'copied' : roomCode}
        </button>
      )}
      {rated && (
        <span
          className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
          title="Rated game — the result affects both players' ratings"
        >
          Rated
        </span>
      )}
      {canClaim && (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => void doClaim()}
          disabled={claim.state === 'busy'}
        >
          {claim.state === 'busy' ? 'Claiming…' : 'Claim for my account'}
        </Button>
      )}
      {claim.state === 'claimed' && <span className="text-xs text-success">claimed for your account</span>}
      {claim.state === 'error' && (
        <span className="text-xs text-danger" title={claim.error}>
          couldn't claim
        </span>
      )}
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={leaveRoom}>
        Leave
      </Button>
    </div>
  )
}
