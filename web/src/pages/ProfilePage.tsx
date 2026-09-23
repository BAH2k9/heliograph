import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, listMyGames } from '../api/client'
import type { GameSummary } from '../api/types'
import { DEFAULT_LAYOUT } from '../game/gamePresets'
import { useAuth } from '../authStore'
import { AVATAR_IDS, Avatar, type AvatarId } from '../components/Avatar'
import { RatingBadges } from '../components/RatingBadges'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Field } from '../ui/Field'

const RULESET_LABELS: Record<string, string> = { Classic: 'Classic', Khet2: 'Khet 2.0' }

function gameLabel(game: GameSummary): string {
  const rulesetLabel = RULESET_LABELS[game.ruleset] ?? game.ruleset
  return game.layout === DEFAULT_LAYOUT ? rulesetLabel : `${rulesetLabel} · ${game.layout}`
}

function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The Status cell's text: raw status while finished, a "· by timeout"/"· by abandonment"/
 *  "· by resignation" qualifier added only when `endReason` says so (an ordinary
 *  Keep-elimination win gets no qualifier). */
function statusLabel(game: GameSummary): string {
  if (!game.finishedAtUtc) return 'In progress'
  if (game.endReason === 'Timeout') return `${game.status} · by timeout`
  if (game.endReason === 'Abandonment') return `${game.status} · by abandonment`
  if (game.endReason === 'Resignation') return `${game.status} · by resignation`
  return game.status
}

// AppLayout guards this route, but the auth store can still transition to null (a manual
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
    <div className="min-h-screen bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Avatar avatarId={user.avatarId} displayName={user.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{user.displayName}</h1>
            <p className="mt-0.5 text-sm text-text-muted">{user.totalGamesPlayed ?? 0} rated games played</p>
            <div className="mt-1.5">
              <RatingBadges ratings={user.ratings} />
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setEditingProfile((v) => !v)}
          >
            {editingProfile ? 'Cancel' : 'Edit profile'}
          </Button>
        </header>

        {editingProfile && (
          <EditProfileForm displayName={user.displayName} avatarId={user.avatarId} onDone={() => setEditingProfile(false)} />
        )}

        <section>
          <h2 className="mb-2 text-lg font-medium">My Games</h2>

          {error && (
            <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
              Couldn't load your games: {error}
            </div>
          )}

          {!games && !error && <p className="text-text-muted">Loading…</p>}

          {games && games.length === 0 && (
            <p className="text-text-muted">
              No games yet — anonymous room games you play can be claimed for this account after the fact
              from the room bar.
            </p>
          )}

          {games && games.length > 0 && (
            <div className="overflow-x-auto rounded-lg bg-surface-raised ring-1 ring-border">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-subtle">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Played</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
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
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {gameLabel(g)}
                        {g.rated && (
                          <Badge variant="accent" className="ml-2">
                            Rated
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">{formatPlayedAt(g.createdAtUtc)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">{statusLabel(g)}</td>
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
 * current values on mount and left alone after that, same as `LoginPage`'s form fields, so
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
      className="mb-6 rounded-lg bg-surface-raised p-4 ring-1 ring-border"
      aria-label="Edit profile"
    >
      <Field
        id="profile-display-name"
        label="Display name"
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value)
          dismissError()
        }}
        maxLength={32}
        autoComplete="nickname"
        className="mb-3 max-w-sm"
      />

      <p className="mb-1.5 text-sm font-medium text-text-muted">Avatar</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={avatarId === id}
            aria-label={id}
            onClick={() => setAvatarId(id)}
            className={cn(
              'rounded-full p-0.5 ring-2 transition-colors',
              avatarId === id ? 'ring-accent' : 'ring-transparent hover:ring-border-strong',
            )}
          >
            <Avatar avatarId={id} displayName={displayName} />
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !canSubmit}>
          Save
        </Button>
      </div>
    </form>
  )
}
