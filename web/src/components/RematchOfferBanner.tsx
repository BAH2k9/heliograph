import { useGame } from '../store'

/**
 * Shown while the *other* seat has an unanswered rematch request pending against this finished
 * game — chess.com-style "your opponent wants a rematch" banner, top of the board. Accept calls
 * the exact same `requestRematch()` `PlayAgainButton`/`WinOverlay` use (this client's own consent
 * *is* its own request — see that action's doc comment), so it completes the match immediately
 * rather than needing a separate server-side "accept" concept. Decline withdraws the request on
 * both sides (`declineRematch`) and resets the offering seat's own button back to "Play again".
 *
 * Renders nothing for a spectator (`seat` is only `"P1"`/`"P2"` here) or once nothing is pending.
 */
export function RematchOfferBanner() {
  const seat = useGame((s) => s.seat)
  const offered = useGame((s) => s.rematchOfferedByOpponent)
  const requestRematch = useGame((s) => s.requestRematch)
  const declineRematch = useGame((s) => s.declineRematch)

  if ((seat !== 'P1' && seat !== 'P2') || !offered) return null

  return (
    <div
      className="flex items-center gap-3 rounded-md bg-accent/15 px-3 py-2 text-sm text-accent"
      data-testid="rematch-offer-banner"
    >
      <span>Your opponent wants a rematch</span>
      <button
        type="button"
        onClick={() => void requestRematch()}
        className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:bg-accent/90"
      >
        Accept
      </button>
      <button
        type="button"
        onClick={() => void declineRematch()}
        className="rounded px-2 py-1 text-xs font-medium text-text-muted hover:text-text"
      >
        Decline
      </button>
    </div>
  )
}
