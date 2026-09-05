import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, listGames } from '../api/client'
import type { GameSummary } from '../api/types'

const RULESET_LABELS: Record<string, string> = { Classic: 'Classic', Khet2: 'Khet 2.0' }
// The one layout each ruleset starts with by default — worth naming only when it differs.
const DEFAULT_LAYOUTS = new Set(['Classic', 'Khet2Classic'])

function gameLabel(game: GameSummary): string {
  const rulesetLabel = RULESET_LABELS[game.ruleset] ?? game.ruleset
  return DEFAULT_LAYOUTS.has(game.layout) ? rulesetLabel : `${rulesetLabel} · ${game.layout}`
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

/** '—' while in progress; otherwise the winner, with a "by timeout"/"by resignation" qualifier
 *  only when `endReason` says so — an ordinary Pharaoh-elimination win gets none. */
function resultLabel(game: GameSummary): string {
  if (game.status === 'InProgress') return '—'
  const winner = game.status === 'P1Win' ? 'Silver (P1)' : 'Red (P2)'
  if (game.endReason === 'Timeout') return `${winner} wins · by timeout`
  if (game.endReason === 'Resignation') return `${winner} wins · by resignation`
  return `${winner} wins`
}

export function GameArchivePage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listGames()
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
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Game Archive</h1>
          <p className="mt-1 text-sm text-slate-400">Every game played, newest first.</p>
        </header>

        {error && (
          <div className="mb-3 flex items-center justify-between rounded bg-rose-900/60 px-3 py-2 text-sm text-rose-100">
            <span>Couldn't load games: {error}</span>
          </div>
        )}

        {!games && !error && <p className="text-slate-400">Loading…</p>}

        {games && games.length === 0 && (
          <p className="text-slate-400">
            No games yet — start one from Local Play, Host Game, or Join Game.
          </p>
        )}

        {games && games.length > 0 && (
          <div className="overflow-hidden rounded-lg bg-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Played</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
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
                    className="cursor-pointer border-b border-slate-700/50 last:border-0 hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3">{gameLabel(g)}</td>
                    <td className="px-4 py-3 text-slate-300">{formatPlayedAt(g.createdAtUtc)}</td>
                    <td className="px-4 py-3 text-slate-300">{resultLabel(g)}</td>
                    <td className="px-4 py-3 text-slate-300">
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
