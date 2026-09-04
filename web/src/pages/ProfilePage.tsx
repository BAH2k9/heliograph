import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, listMyGames } from '../api/client'
import type { GameSummary } from '../api/types'
import { useAuth } from '../authStore'

const RULESET_LABELS: Record<string, string> = { Classic: 'Classic', Khet2: 'Khet 2.0' }
const DEFAULT_LAYOUTS = new Set(['Classic', 'Khet2Classic'])

function gameLabel(game: GameSummary): string {
  const rulesetLabel = RULESET_LABELS[game.ruleset] ?? game.ruleset
  return DEFAULT_LAYOUTS.has(game.layout) ? rulesetLabel : `${rulesetLabel} · ${game.layout}`
}

function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// RequireAuth guards this route, but the auth store can still transition to null (a manual
// logout while this page is open) before the route redirect commits — guard against that render.
export function ProfilePage() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const [games, setGames] = useState<GameSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
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
  }, [user])

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-600 text-2xl font-bold">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{user.displayName}</h1>
            <p className="text-sm text-slate-400">
              Rating: {user.rating} · {user.ratedGamesPlayed} rated game{user.ratedGamesPlayed === 1 ? '' : 's'}
            </p>
          </div>
        </header>

        <section>
          <h2 className="mb-2 text-lg font-medium">My Games</h2>

          {error && (
            <div className="mb-3 rounded bg-rose-900/60 px-3 py-2 text-sm text-rose-100">
              Couldn't load your games: {error}
            </div>
          )}

          {!games && !error && <p className="text-slate-400">Loading…</p>}

          {games && games.length === 0 && (
            <p className="text-slate-400">
              No games yet — anonymous room games you play can be claimed for this account after the fact
              from the room bar.
            </p>
          )}

          {games && games.length > 0 && (
            <div className="overflow-hidden rounded-lg bg-slate-800">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Played</th>
                    <th className="px-4 py-3 font-medium">Status</th>
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
                      <td className="px-4 py-3">
                        {gameLabel(g)}
                        {g.rated && (
                          <span className="ml-2 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                            Rated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{formatPlayedAt(g.createdAtUtc)}</td>
                      <td className="px-4 py-3 text-slate-300">{g.finishedAtUtc ? g.status : 'In progress'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
