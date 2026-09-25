import { useCallback, useEffect, useState } from 'react'
import { deleteGame, forceEndGame, listGames } from '../../api/adminClient'
import type { AdminGameRow } from '../../api/adminTypes'
import type { GameStatus } from '../../api/types'
import { SIDE_NAMES, winnerSideName } from '../../game/displayNames'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Dialog, DialogContent, DialogFooter } from '../../ui/Dialog'
import { AdminNav } from './AdminNav'
import { errText } from './shared'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'P1Win', label: statusText('P1Win') },
  { value: 'P2Win', label: statusText('P2Win') },
]

function statusVariant(status: string): 'accent' | 'neutral' {
  return status === 'InProgress' ? 'accent' : 'neutral'
}

/** On-screen text for a game's status — by side name, never the raw `P1Win`/`P2Win` id. */
function statusText(status: GameStatus): string {
  return status === 'InProgress' ? 'In progress' : `${winnerSideName(status)} wins`
}

export function AdminGamesPage() {
  const [rows, setRows] = useState<AdminGameRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState('')
  const [roomsOnly, setRoomsOnly] = useState(false)
  const [ratedOnly, setRatedOnly] = useState(false)

  const [selected, setSelected] = useState<AdminGameRow | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    listGames({
      status: status || undefined,
      rooms: roomsOnly || undefined,
      rated: ratedOnly || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return
        setRows(data.games)
        setTotal(data.total)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errText(e))
      })
    return () => {
      cancelled = true
    }
  }, [status, roomsOnly, ratedOnly, page])

  useEffect(() => load(), [load])

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex-1 bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-text-muted">Games and rooms.</p>
        </header>

        <AdminNav />

        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => resetToFirstPage(setStatus)(e.target.value)}
            className="rounded-md bg-surface-sunken px-3 py-2 text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-text-muted">
            <input
              type="checkbox"
              checked={roomsOnly}
              onChange={(e) => resetToFirstPage(setRoomsOnly)(e.target.checked)}
            />
            Rooms only
          </label>
          <label className="flex items-center gap-2 text-text-muted">
            <input
              type="checkbox"
              checked={ratedOnly}
              onChange={(e) => resetToFirstPage(setRatedOnly)(e.target.checked)}
            />
            Rated only
          </label>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load games: {error}
          </div>
        )}

        {!rows && !error && <p className="text-text-muted">Loading…</p>}

        {rows && rows.length === 0 && <p className="text-text-muted">No games match.</p>}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-surface-raised ring-1 ring-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Players</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Moves</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(g)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(g)
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-text-muted">{new Date(g.createdAtUtc).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={statusVariant(g.status)}>{statusText(g.status)}</Badge>
                        {g.endReason && <span className="text-xs text-text-subtle">{g.endReason}</span>}
                        {g.rated && <Badge variant="success">rated</Badge>}
                        {g.joinCode && <Badge>room</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {(g.p1DisplayName ?? '—') + ' vs ' + (g.p2DisplayName ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{g.timeControl ?? 'untimed'}</td>
                    <td className="px-4 py-3 text-text-muted tabular-nums">{g.moveCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows && pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm text-text-muted">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <GameActionsDialog
            game={selected}
            onChanged={() => {
              setSelected(null)
              load()
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function GameActionsDialog({ game, onChanged }: { game: AdminGameRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const inProgress = game.status === 'InProgress'
  const eloWarning = game.rated && game.finishedAtUtc != null

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }

  return (
    <DialogContent title="Game" description={game.id} size="md">
      {err && <p className="mb-3 text-sm text-danger">{err}</p>}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Status</dt>
        <dd>
          {statusText(game.status)}
          {game.endReason ? ` · ${game.endReason}` : ''}
        </dd>
        <dt className="text-text-muted">Players</dt>
        <dd>{(game.p1DisplayName ?? '—') + ' vs ' + (game.p2DisplayName ?? '—')}</dd>
        <dt className="text-text-muted">Rated</dt>
        <dd>{game.rated ? 'yes' : 'no'}</dd>
        <dt className="text-text-muted">Time control</dt>
        <dd>{game.timeControl ?? 'untimed'}</dd>
      </dl>

      {inProgress && (
        <section className="mt-5">
          <div className="text-sm font-medium text-text-muted">Force-end</div>
          <p className="mt-1 text-xs text-text-subtle">
            Records a winner and ends the game as “Aborted”. Does not affect ratings.
          </p>
          <div className="mt-2 flex gap-2">
            {(['P1', 'P2'] as const).map((seat) => (
              <Button
                key={seat}
                variant="secondary"
                disabled={busy}
                onClick={() => void act(() => forceEndGame(game.id, { winner: seat }))}
              >
                {SIDE_NAMES[seat]} wins
              </Button>
            ))}
          </div>
        </section>
      )}

      <DialogFooter>
        {confirmDelete ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void act(() => deleteGame(game.id))}>
              Delete permanently
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-end gap-1">
            {eloWarning && (
              <p className="text-xs text-warning">
                This game is rated and finished — deleting it will not reverse the Elo it applied.
              </p>
            )}
            <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete game…
            </Button>
          </div>
        )}
      </DialogFooter>
    </DialogContent>
  )
}
