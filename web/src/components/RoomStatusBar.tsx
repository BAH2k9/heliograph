import { useState } from 'react'
import { useGame } from '../store'

/**
 * The room's out-of-the-way controls, tucked into the `PlayScreen` header: the shareable code
 * (click to copy) and a rated marker. Whose-turn / which-seat state lives on the two
 * `PlayerCard`s now, not here. There is deliberately no "Leave" — resignation (`ResignButton`) is
 * the only way to end a game early now, so a mid-match seat has no separate, reversible exit.
 * Renders nothing outside a room.
 */
export function RoomStatusBar() {
  const seat = useGame((s) => s.seat)
  const roomCode = useGame((s) => s.roomCode)
  const rated = useGame((s) => s.rated)

  const [copied, setCopied] = useState(false)

  if (!seat) return null

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
    </div>
  )
}
