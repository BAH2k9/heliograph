import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'

/** How long the "Confirm resign?" state stays up before reverting on its own. */
const RESIGN_CONFIRM_MS = 3_000

/**
 * Two-step inline resign confirm (no modal), shared by `ResignButton` and `ActiveGameBanner` so
 * both get the exact same arm/confirm/revert behavior from one implementation: the first
 * `handleClick` arms it, a second within `RESIGN_CONFIRM_MS` actually resigns. Reverts on its own
 * after the timeout, on `handleBlur` (a click elsewhere), or the instant `canResign` goes false —
 * a stray leftover "Confirm resign?" must never resign a game the player never actually confirmed
 * resigning against (e.g. the game ended out from under them between the two clicks).
 */
export function useResignConfirm(canResign: boolean) {
  const resign = useGame((s) => s.resign)

  const [armed, setArmed] = useState(false)
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (revertTimer.current) clearTimeout(revertTimer.current)
  }, [])

  // Adjusted inline during render (React's "adjusting state when a prop changes" pattern) rather
  // than in an effect — see `ResignButton`'s original doc for why this can't wait for an effect.
  const [prevCanResign, setPrevCanResign] = useState(canResign)
  if (prevCanResign !== canResign) {
    setPrevCanResign(canResign)
    if (!canResign && armed) setArmed(false)
  }

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

  return { armed, handleClick, handleBlur: disarm }
}
