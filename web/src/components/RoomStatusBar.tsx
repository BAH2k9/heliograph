import { useState } from 'react'
import { ApiError, claimSeat } from '../api/client'
import { useAuth } from '../authStore'
import { DisconnectBanner } from './DisconnectBanner'
import { GameClock } from './GameClock'
import { seatStatus } from '../game/turnLock'
import { useGame } from '../store'

/** Shown while seated in a room: the shareable code, which seat you hold, whose turn it is, and a way out. */
export function RoomStatusBar() {
  const gameId = useGame((s) => s.gameId)
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const turn = useGame((s) => s.turn)
  const status = useGame((s) => s.status)
  const rated = useGame((s) => s.rated)
  const p1Claimed = useGame((s) => s.p1Claimed)
  const p2Claimed = useGame((s) => s.p2Claimed)
  const leaveRoom = useGame((s) => s.leaveRoom)
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
    } catch (e) {
      setClaim({ state: 'error', error: e instanceof ApiError ? e.detail : String(e) })
    }
  }

  return (
    <>
      <DisconnectBanner />
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded bg-slate-800 px-3 py-2 text-sm">
        <span className="font-medium">Room</span>
        {roomCode && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(roomCode)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
            className="rounded bg-slate-700 px-2 py-1 font-mono tracking-widest hover:bg-slate-600"
            title="Copy room code"
          >
            {roomCode}
          </button>
        )}
        {copied && <span className="text-emerald-400">copied</span>}
        {rated && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">Rated</span>
        )}
        <GameClock />
        <span className="text-slate-400">you are {seat}</span>
        {canClaim && (
          <button
            type="button"
            onClick={() => void doClaim()}
            disabled={claim.state === 'busy'}
            className="rounded bg-sky-700 px-2 py-1 text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
          >
            {claim.state === 'busy' ? 'Claiming…' : 'Claim for my account'}
          </button>
        )}
        {claim.state === 'claimed' && <span className="text-emerald-400">claimed for your account</span>}
        {claim.state === 'error' && (
          <span className="text-rose-400" title={claim.error}>
            couldn't claim
          </span>
        )}
        <span className="ml-auto font-medium text-sky-300" data-testid="seat-status">
          {seatStatus(seat, turn, status)}
        </span>
        <button
          type="button"
          onClick={leaveRoom}
          className="rounded px-2 py-1 text-slate-400 underline hover:text-white"
        >
          Leave
        </button>
      </div>
    </>
  )
}
