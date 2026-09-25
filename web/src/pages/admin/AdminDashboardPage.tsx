import { useEffect, useState } from 'react'
import { cleanupRooms, getStats } from '../../api/adminClient'
import type { AdminStats } from '../../api/adminTypes'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Panel } from '../../ui/Panel'
import { AdminNav } from './AdminNav'
import { errText } from './shared'

const CARDS: { key: keyof AdminStats; label: string }[] = [
  { key: 'totalUsers', label: 'Users' },
  { key: 'adminCount', label: 'Admins' },
  { key: 'disabledCount', label: 'Disabled' },
  { key: 'gamesInProgress', label: 'Games in progress' },
  { key: 'gamesFinished', label: 'Games finished' },
  { key: 'openRooms', label: 'Open rooms' },
  { key: 'ratedGames', label: 'Rated games' },
]

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [hours, setHours] = useState('24')
  const [cleaning, setCleaning] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const [cleanupErr, setCleanupErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errText(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function runCleanup() {
    setCleaning(true)
    setCleanupMsg(null)
    setCleanupErr(null)
    try {
      const { deletedCount } = await cleanupRooms({ olderThanHours: Number(hours) || 0 })
      setCleanupMsg(`Removed ${deletedCount} stale room${deletedCount === 1 ? '' : 's'}.`)
      setStats(await getStats())
    } catch (e) {
      setCleanupErr(errText(e))
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="flex-1 bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-text-muted">Site administration.</p>
        </header>

        <AdminNav />

        {error && (
          <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load stats: {error}
          </div>
        )}

        {!stats && !error && <p className="text-text-muted">Loading…</p>}

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CARDS.map((card) => (
              <Panel key={card.key} className="p-4">
                <div className="text-2xl font-semibold tabular-nums">{stats[card.key]}</div>
                <div className="mt-1 text-xs text-text-muted">{card.label}</div>
              </Panel>
            ))}
          </div>
        )}

        <Panel className="mt-6 p-4">
          <h2 className="text-sm font-semibold">Clean up stale rooms</h2>
          <p className="mt-1 text-xs text-text-muted">
            Deletes rooms that are still in progress, never got a second player, and are older than the
            cutoff. Nothing else removes these.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field
              label="Older than (hours)"
              type="number"
              min={0}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-40"
            />
            <Button variant="secondary" onClick={() => void runCleanup()} disabled={cleaning}>
              {cleaning ? 'Cleaning…' : 'Run cleanup'}
            </Button>
          </div>
          {cleanupMsg && <p className="mt-2 text-sm text-success">{cleanupMsg}</p>}
          {cleanupErr && <p className="mt-2 text-sm text-danger">{cleanupErr}</p>}
        </Panel>
      </div>
    </div>
  )
}
