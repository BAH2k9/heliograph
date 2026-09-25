import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, listMyGames } from '../api/client'
import type { GameSummary } from '../api/types'
import { winnerSideName } from '../game/displayNames'
import { DEFAULT_LAYOUT, rulesetLabel } from '../game/gamePresets'

function gameLabel(game: GameSummary): string {
  const label = rulesetLabel(game.ruleset)
  return game.layout === DEFAULT_LAYOUT ? label : `${label} · ${game.layout}`
}

function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDuration(startIso: string, endIso: string): string {
  const totalSeconds = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** '—' while in progress; otherwise the winner, with a "by timeout"/"by abandonment"/"by
 *  resignation"/"aborted" qualifier only when `endReason` says so — an ordinary
 *  Keep-elimination win gets none. `Aborted` still records a winner (admin force-end). */
function resultLabel(game: GameSummary): string {
  if (game.status === 'InProgress') return '—'
  const winner = winnerSideName(game.status)
  if (game.endReason === 'Timeout') return `${winner} wins · by timeout`
  if (game.endReason === 'Abandonment') return `${winner} wins · by abandonment`
  if (game.endReason === 'Resignation') return `${winner} wins · by resignation`
  if (game.endReason === 'Aborted') return `${winner} wins · aborted`
  return `${winner} wins`
}

export function GameArchivePage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listMyGames()
      .then((data) => {
        if (!cancelled) setGames(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex-1 bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Game Archive</h1>
          <p className="mt-1 text-sm text-text-muted">Your games, newest first.</p>
        </header>

        {error && (
          <div className="mb-3 flex items-center justify-between rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            <span>Couldn't load games: {error}</span>
          </div>
        )}

        {!games && !error && <p className="text-text-muted">Loading…</p>}

        {games && games.length === 0 && (
          <p className="text-text-muted">
            No games yet — start one from Local Play, Host Game, or Join Game.
          </p>
        )}

        {games && games.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-surface-raised ring-1 ring-border">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-subtle">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Played</th>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                  <th className="px-4 py-2.5 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/replay/${g.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') navigate(`/replay/${g.id}`)
                    }}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-row-hover"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">{gameLabel(g)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">{formatPlayedAt(g.createdAtUtc)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">{resultLabel(g)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">
                      {g.finishedAtUtc ? formatDuration(g.createdAtUtc, g.finishedAtUtc) : 'In progress'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
