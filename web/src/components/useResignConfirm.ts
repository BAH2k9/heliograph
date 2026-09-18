import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'

/** How long an armed confirm state stays up before reverting on its own. */
const CONFIRM_MS = 3_000

/**
 * Two-step inline confirm (no modal): the first `handleClick` arms it, a second within
 * `CONFIRM_MS` actually fires `action`. Reverts on its own after the timeout, on `handleBlur` (a
 * click elsewhere), or the instant `canAct` goes false — a stray leftover armed state must never
 * fire against a game that's no longer in the state the player armed it against (e.g. it ended out
 * from under them between the two clicks). Shared by `ResignButton`/`ActiveGameBanner` (resign) and
 * `RestartGameButton` (instant restart) so every destructive in-game action gets the same
 * arm/confirm/revert behavior from one implementation.
 */
export function useConfirmClick(canAct: boolean, action: () => void) {
  const [armed, setArmed] = useState(false)
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (revertTimer.current) clearTimeout(revertTimer.current)
  }, [])

  // Adjusted inline during render (React's "adjusting state when a prop changes" pattern) rather
  // than in an effect — see `ResignButton`'s original doc for why this can't wait for an effect.
  const [prevCanAct, setPrevCanAct] = useState(canAct)
  if (prevCanAct !== canAct) {
    setPrevCanAct(canAct)
    if (!canAct && armed) setArmed(false)
  }

  function disarm() {
    if (revertTimer.current) clearTimeout(revertTimer.current)
    setArmed(false)
  }

  function handleClick() {
    if (!armed) {
      setArmed(true)
      if (revertTimer.current) clearTimeout(revertTimer.current)
      revertTimer.current = setTimeout(() => setArmed(false), CONFIRM_MS)
      return
    }
    disarm()
    action()
  }

  return { armed, handleClick, handleBlur: disarm }
}

/** `useConfirmClick` bound to the store's `resign` action — the shape `ResignButton` and
 *  `ActiveGameBanner` both used before `useConfirmClick` was generalized to take any action. */
export function useResignConfirm(canResign: boolean) {
  const resign = useGame((s) => s.resign)
  return useConfirmClick(canResign, () => void resign())
}
