import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getLeaderboard } from '../api/authClient'
import type { LeaderboardEntry } from '../api/authTypes'
import { TIME_CONTROL_CATEGORIES, type TimeControlCategoryId } from '../game/timeControls'

export function LeaderboardPage() {
  // Blitz is the default tab — chess.com's own convention for "the" rating when one must be
  // picked, and this repo's `TIME_CONTROL_CATEGORIES` order (Bullet/Blitz/Rapid/Daily) agrees.
  const [category, setCategory] = useState<TimeControlCategoryId>('Blitz')
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getLeaderboard(category)
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [category])

  /** Switches the active tab and resets to a loading state — done here (the user-initiated
   *  event) rather than as a synchronous setState at the top of the effect above. */
  function selectCategory(next: TimeControlCategoryId) {
    setCategory(next)
    setEntries(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Leaderboard</h1>
          <p className="mt-1 text-sm text-text-muted">Top-rated players.</p>
        </header>

        <div className="mb-4 flex gap-1 rounded-lg bg-surface-raised p-1 ring-1 ring-border">
          {TIME_CONTROL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCategory(cat.id)}
              aria-pressed={category === cat.id}
              className={[
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                category === cat.id
                  ? 'bg-accent text-accent-fg'
                  : 'text-text-muted hover:bg-row-hover hover:text-text',
              ].join(' ')}
            >
              {cat.id}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load the leaderboard: {error}
          </div>
        )}

        {!entries && !error && <p className="text-text-muted">Loading…</p>}

        {entries && entries.length === 0 && (
          <p className="text-text-muted">No rated {category} games played yet.</p>
        )}

        {entries && entries.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-surface-raised ring-1 ring-border">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-subtle">
                  <th className="w-12 px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Player</th>
                  <th className="px-4 py-2.5 font-medium">Rating</th>
                  <th className="px-4 py-2.5 font-medium">Games</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.userId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 tabular-nums text-text-subtle">{i + 1}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{e.displayName}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">{e.rating}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">{e.ratedGamesPlayed}</td>
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
