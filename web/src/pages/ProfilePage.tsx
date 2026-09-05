import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, listMyGames } from '../api/client'
import type { GameSummary } from '../api/types'
import type { RatingBucket } from '../api/authTypes'
import { useAuth } from '../authStore'
import { TIME_CONTROL_CATEGORIES } from '../game/timeControls'

const RULESET_LABELS: Record<string, string> = { Classic: 'Classic', Khet2: 'Khet 2.0' }
const DEFAULT_LAYOUTS = new Set(['Classic', 'Khet2Classic'])

function gameLabel(game: GameSummary): string {
  const rulesetLabel = RULESET_LABELS[game.ruleset] ?? game.ruleset
  return DEFAULT_LAYOUTS.has(game.layout) ? rulesetLabel : `${rulesetLabel} · ${game.layout}`
}

function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The Status cell's text: raw status while finished, a "· by timeout" qualifier added only
 *  when `endReason` says so (an ordinary Pharaoh-elimination win gets no qualifier). */
function statusLabel(game: GameSummary): string {
  if (!game.finishedAtUtc) return 'In progress'
  return game.endReason === 'Timeout' ? `${game.status} · by timeout` : game.status
}

/** Badge display order is frontend-owned (Bullet/Blitz/Rapid/Daily, matching
 *  `TIME_CONTROL_CATEGORIES`) — the wire contract only pins the bucket *count* (always 4), not
 *  their order in the array. Looking each one up by name means a missing bucket degrades to
 *  fewer badges rather than shifting a later category into the wrong slot. */
function orderedRatings(ratings: RatingBucket[]): RatingBucket[] {
  return TIME_CONTROL_CATEGORIES.flatMap((cat) => {
    const bucket = ratings.find((r) => r.category === cat.id)
    return bucket ? [bucket] : []
  })
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
            <div className="mt-1 flex flex-wrap gap-2">
              {orderedRatings(user.ratings).map((bucket) => (
                <span
                  key={bucket.category}
                  className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300"
                  title={`${bucket.gamesPlayed} rated game${bucket.gamesPlayed === 1 ? '' : 's'}`}
                >
                  {bucket.category} {bucket.rating}
                </span>
              ))}
            </div>
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
                      <td className="px-4 py-3 text-slate-300">{statusLabel(g)}</td>
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
