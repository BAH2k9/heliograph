import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getLeaderboard } from '../api/authClient'
import type { LeaderboardEntry } from '../api/authTypes'

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getLeaderboard()
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
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Leaderboard</h1>
          <p className="mt-1 text-sm text-slate-400">Top-rated players.</p>
        </header>

        {error && (
          <div className="mb-3 rounded bg-rose-900/60 px-3 py-2 text-sm text-rose-100">
            Couldn't load the leaderboard: {error}
          </div>
        )}

        {!entries && !error && <p className="text-slate-400">Loading…</p>}

        {entries && entries.length === 0 && <p className="text-slate-400">No rated games played yet.</p>}

        {entries && entries.length > 0 && (
          <div className="overflow-hidden rounded-lg bg-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Rating</th>
                  <th className="px-4 py-3 font-medium">Games</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.userId} className="border-b border-slate-700/50 last:border-0">
                    <td className="px-4 py-3 text-slate-300">{i + 1}</td>
                    <td className="px-4 py-3">{e.displayName}</td>
                    <td className="px-4 py-3 text-slate-300">{e.rating}</td>
                    <td className="px-4 py-3 text-slate-300">{e.ratedGamesPlayed}</td>
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
