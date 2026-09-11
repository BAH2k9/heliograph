import { useEffect, useRef, useState } from 'react'
import { cn } from '../ui/cn'
import { useGame } from '../store'

/** How long the "Confirm resign?" state stays up before reverting on its own. */
const RESIGN_CONFIRM_MS = 3_000

/**
 * Two-step inline resign confirm (no modal): first click arms it, second click within
 * RESIGN_CONFIRM_MS actually resigns. Reverts on its own after the timeout, or when the button
 * loses focus (a click elsewhere). Renders nothing unless the viewer holds a seat in a game
 * that's still in progress. Floated over the top-right of the board by `PlayScreen`.
 */
export function ResignButton({ className }: { className?: string }) {
  const seat = useGame((s) => s.seat)
  const status = useGame((s) => s.status)
  const resign = useGame((s) => s.resign)

  const [armed, setArmed] = useState(false)
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (revertTimer.current) clearTimeout(revertTimer.current)
  }, [])

  const canResign = (seat === 'P1' || seat === 'P2') && status === 'InProgress'

  // This button isn't remounted between games, so an armed confirm needs to be dropped once
  // resigning is no longer valid — otherwise a stray leftover "Confirm resign?" could resign a
  // game the player never confirmed resigning. Adjusted inline during render (React's "adjusting
  // state when a prop changes" pattern) rather than in an effect.
  const [prevCanResign, setPrevCanResign] = useState(canResign)
  if (prevCanResign !== canResign) {
    setPrevCanResign(canResign)
    if (!canResign && armed) setArmed(false)
  }

  if (!canResign) return null

  function disarm() {
    if (revertTimer.current) clearTimeout(revertTimer.current)
    setArmed(false)
  }

  function handleClick() {
    if (!armed) {
      setArmed(true)
      if (revertTimer.current) clearTimeout(revertTimer.current)
      revertTimer.current = setTimeout(() => setArmed(false), RESIGN_CONFIRM_MS)
      return
    }
    disarm()
    void resign()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={disarm}
      className={cn(
        'rounded px-2 py-1 text-xs font-medium shadow-sm transition-colors',
        armed
          ? 'bg-danger text-danger-fg hover:bg-danger/90'
          : 'bg-surface-raised/90 text-danger ring-1 ring-border hover:bg-surface-raised',
        className,
      )}
    >
      {armed ? 'Confirm resign?' : 'Resign'}
    </button>
  )
}
