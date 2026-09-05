import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, listMyGames } from '../api/client'
import type { GameSummary } from '../api/types'
import type { RatingBucket } from '../api/authTypes'
import { useAuth } from '../authStore'
import { AVATAR_IDS, Avatar, type AvatarId } from '../components/Avatar'
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

/** The Status cell's text: raw status while finished, a "· by timeout"/"· by abandonment"/
 *  "· by resignation" qualifier added only when `endReason` says so (an ordinary
 *  Pharaoh-elimination win gets no qualifier). */
function statusLabel(game: GameSummary): string {
  if (!game.finishedAtUtc) return 'In progress'
  if (game.endReason === 'Timeout') return `${game.status} · by timeout`
  if (game.endReason === 'Abandonment') return `${game.status} · by abandonment`
  if (game.endReason === 'Resignation') return `${game.status} · by resignation`
  return game.status
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
  const [editingProfile, setEditingProfile] = useState(false)

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
          <Avatar avatarId={user.avatarId} displayName={user.displayName} size="lg" />
          <div className="flex-1">
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
          <button
            type="button"
            onClick={() => setEditingProfile((v) => !v)}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-600"
          >
            {editingProfile ? 'Cancel' : 'Edit profile'}
          </button>
        </header>

        {editingProfile && (
          <EditProfileForm displayName={user.displayName} avatarId={user.avatarId} onDone={() => setEditingProfile(false)} />
        )}

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

/**
 * Display name + the 8-icon avatar picker, calling `PATCH /api/auth/me` (via `authStore
 * .updateProfile`). Uncontrolled from `user` itself — local field state is seeded from the
 * current values on mount and left alone after that, same as `AuthDialog`'s form fields, so
 * typing doesn't fight a `user` update mid-edit.
 */
function EditProfileForm({
  displayName: initialDisplayName,
  avatarId: initialAvatarId,
  onDone,
}: {
  displayName: string
  avatarId?: string | null
  onDone: () => void
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [avatarId, setAvatarId] = useState<AvatarId | null>(
    initialAvatarId && (AVATAR_IDS as readonly string[]).includes(initialAvatarId) ? (initialAvatarId as AvatarId) : null,
  )
  const busy = useAuth((s) => s.busy)
  const error = useAuth((s) => s.error)
  const updateProfile = useAuth((s) => s.updateProfile)
  const dismissError = useAuth((s) => s.dismissError)

  const trimmedName = displayName.trim()
  const canSubmit = trimmedName !== ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const patch: { displayName?: string; avatarId?: string } = { displayName: trimmedName }
    if (avatarId) patch.avatarId = avatarId
    const ok = await updateProfile(patch)
    if (ok) onDone()
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mb-6 rounded-lg bg-slate-800 p-4"
      aria-label="Edit profile"
    >
      <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="profile-display-name">
        Display name
      </label>
      <input
        id="profile-display-name"
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value)
          dismissError()
        }}
        maxLength={32}
        autoComplete="nickname"
        className="mb-4 w-full max-w-sm rounded bg-slate-900 px-3 py-2 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
      />

      <p className="mb-2 text-sm font-medium text-slate-300">Avatar</p>
      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={avatarId === id}
            aria-label={id}
            onClick={() => setAvatarId(id)}
            className={[
              'rounded-full p-0.5 ring-2',
              avatarId === id ? 'ring-sky-500' : 'ring-transparent hover:ring-slate-600',
            ].join(' ')}
          >
            <Avatar avatarId={id} displayName={displayName} />
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  )
}
