import { useState } from 'react'
import { type BugReportBody, reportBug } from '../api/reportBug'
import { getRingBuffer } from '../diagnostics'
import { getConnectionId } from '../realtime'
import { useGame } from '../store'
import { Button } from '../ui/Button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '../ui/Dialog'

/**
 * "Report a bug" — files a diagnostic bundle for the current game
 * (`backlog/10-bug-traceability.md`). Modeled on `SettingsDialog.tsx`'s composition over
 * `ui/Dialog.tsx`. No free-text field — the plan's Out of scope section calls that out as a
 * trivial follow-up, not something to add here.
 *
 * On open, assembles the bundle from a one-shot `useGame.getState()` read (never a reactive
 * subscription — this dialog doesn't need to re-render as the game continues underneath it) plus
 * `getRingBuffer()` and `getConnectionId()`, then calls `reportBug`.
 *
 * **Never imports or reads `useAuth`/any token** — not even to redact it, so there's no code path
 * that could serialize one. The bundle is built entirely from `useGame` (game state) and
 * `diagnostics.ts`/`realtime.ts` (ring buffer + connection id) — and the ring buffer itself only
 * ever records a REST call's URL/status (see `authFetch.ts`), never a request body or header, so
 * a login call's credentials can't land in it by construction.
 */
export function BugReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStatus('idle')
    setError(null)
  }

  async function submit() {
    const game = useGame.getState()
    if (!game.gameId) return

    setStatus('sending')
    setError(null)

    const body: BugReportBody = {
      seat: game.seat,
      connectionId: getConnectionId(),
      moveCount: game.moveCount,
      turn: game.turn,
      status: game.status,
      serverOffsetMs: game.serverOffsetMs,
      // Set only in `applyRemoteMove` (a hub-pushed move) per the plan — a submitter's own
      // locally-applied move doesn't overwrite it, so this tracks the last move either client
      // observed arrive over the wire, not the last one this client happened to send.
      lastTraceId: game.lastMoveApplied?.traceId ?? null,
      clientCapturedAtUtc: new Date().toISOString(),
      bundle: {
        ringBuffer: getRingBuffer(),
        lastMoveApplied: game.lastMoveApplied,
        gameId: game.gameId,
        seat: game.seat,
        moveCount: game.moveCount,
        turn: game.turn,
        status: game.status,
      },
    }

    try {
      await reportBug(game.gameId, body)
      setStatus('sent')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Failed to send the report.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose()
          reset()
        }
      }}
    >
      <DialogContent
        title="Report a bug"
        description="Sends a snapshot of recent client activity (moves, hub events) for this game — no account credentials are ever included."
        size="sm"
      >
        {status === 'sent' ? (
          <p className="text-sm text-text-muted">Thanks — the report was sent.</p>
        ) : (
          status === 'error' &&
          error && <p className="text-sm text-danger">{error}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              {status === 'sent' ? 'Close' : 'Cancel'}
            </Button>
          </DialogClose>
          {status !== 'sent' && (
            <Button size="sm" onClick={() => void submit()} disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send report'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
