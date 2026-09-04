import { useState } from 'react'
import { seatStatus } from '../game/turnLock'
import { useGame } from '../store'

/** Shown while seated in a room: the shareable code, which seat you hold, whose turn it is, and a way out. */
export function RoomStatusBar() {
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const turn = useGame((s) => s.turn)
  const status = useGame((s) => s.status)
  const leaveRoom = useGame((s) => s.leaveRoom)

  const [copied, setCopied] = useState(false)

  if (!seat) return null

  return (
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
      <span className="text-slate-400">you are {seat}</span>
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
  )
}
