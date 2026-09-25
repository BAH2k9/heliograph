import { useGame } from '../store'

/**
 * The room's out-of-the-way status, tucked into the `PlayScreen` header: a rated marker.
 * Whose-turn / which-seat state lives on the two `PlayerCard`s now, not here. There is
 * deliberately no "Leave" — resignation (`ResignButton`) is the only way to end a game early now,
 * so a mid-match seat has no separate, reversible exit. Renders nothing outside a room.
 */
export function RoomStatusBar() {
  const seat = useGame((s) => s.seat)
  const rated = useGame((s) => s.rated)

  if (!seat || !rated) return null

  return (
    <span
      className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
      title="Rated game — the result affects both players' ratings"
    >
      Rated
    </span>
  )
}
