import { useState } from 'react'
import { seatStatus } from '../game/turnLock'
import { useGame } from '../store'

/**
 * Create / join / status strip for realtime rooms. Hidden value when solo: just the two
 * entry points. Once seated, shows the shareable code, which seat you hold, whose turn it is,
 * and a way out.
 */
export function RoomBar() {
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const turn = useGame((s) => s.turn)
  const status = useGame((s) => s.status)
  const busy = useGame((s) => s.busy)
  const createRoom = useGame((s) => s.createRoom)
  const joinRoom = useGame((s) => s.joinRoom)
  const leaveRoom = useGame((s) => s.leaveRoom)

  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  if (seat) {
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

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm">
      <button
        type="button"
        onClick={() => void createRoom()}
        disabled={busy}
        className="rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500 disabled:opacity-50"
      >
        Create room
      </button>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) void joinRoom(code)
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="code"
          aria-label="Room code"
          maxLength={6}
          className="w-24 rounded bg-slate-900 px-2 py-1.5 font-mono uppercase tracking-widest outline-none ring-1 ring-slate-700 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600 disabled:opacity-50"
        >
          Join
        </button>
      </form>
    </div>
  )
}
