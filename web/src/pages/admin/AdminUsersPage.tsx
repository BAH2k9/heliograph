import { useCallback, useEffect, useState } from 'react'
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  patchUser,
  revokeSessions,
  setPassword,
  setRating,
} from '../../api/adminClient'
import type { AdminUserRow } from '../../api/adminTypes'
import { TIME_CONTROL_CATEGORIES } from '../../game/timeControls'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Dialog, DialogContent, DialogFooter } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { AdminNav } from './AdminNav'
import { errText } from './shared'

const PAGE_SIZE = 20

export function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<AdminUserRow | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    listUsers({ search: search || undefined, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return
        setRows(data.users)
        setTotal(data.total)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errText(e))
      })
    return () => {
      cancelled = true
    }
  }, [search, page])

  useEffect(() => load(), [load])

  // Debounce the search box; reset to page 1 whenever the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /** Apply a fresh row from an action: update the open dialog and the list in place. */
  function applyRow(row: AdminUserRow) {
    setSelected(row)
    setRows((current) => current?.map((r) => (r.id === row.id ? row : r)) ?? current)
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="mt-1 text-sm text-text-muted">Accounts.</p>
        </header>

        <AdminNav />

        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field
            label="Search"
            placeholder="email or display name"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-w-48 flex-1"
          />
          <Button onClick={() => setCreating(true)}>New user</Button>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load users: {error}
          </div>
        )}

        {!rows && !error && <p className="text-text-muted">Loading…</p>}

        {rows && rows.length === 0 && <p className="text-text-muted">No accounts match.</p>}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-surface-raised ring-1 ring-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 font-medium">Sessions</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(u)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(u)
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.displayName}</div>
                      <div className="text-xs text-text-muted">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {u.isAdmin && <Badge variant="accent">admin</Badge>}
                        {u.isDisabled && <Badge variant="danger">disabled</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted tabular-nums">{u.activeSessionCount}</td>
                    <td className="px-4 py-3 text-text-muted">{new Date(u.createdAtUtc).toLocaleDateString()}</td>
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
          <UserActionsDialog
            user={selected}
            onApplied={applyRow}
            onDeleted={() => {
              setSelected(null)
              load()
            }}
          />
        )}
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <CreateUserDialog
            onCreated={() => {
              setCreating(false)
              setPage(1)
              load()
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function UserActionsDialog({
  user,
  onApplied,
  onDeleted,
}: {
  user: AdminUserRow
  onApplied: (row: AdminUserRow) => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [name, setName] = useState(user.displayName)
  const [newPassword, setNewPassword] = useState('')
  const [ratingCat, setRatingCat] = useState(TIME_CONTROL_CATEGORIES[0].id)
  const [ratingValue, setRatingValue] = useState('')
  const [ratingGames, setRatingGames] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(label: string, fn: () => Promise<AdminUserRow | void>) {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      const row = await fn()
      if (row) onApplied(row)
      setOk(label)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent title={user.displayName} description={user.email} size="md">
      {err && <p className="mb-3 text-sm text-danger">{err}</p>}
      {ok && <p className="mb-3 text-sm text-success">{ok}</p>}

      <div className="space-y-5">
        <section className="flex items-end gap-2">
          <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Button
            variant="secondary"
            disabled={busy || name.trim() === '' || name.trim() === user.displayName}
            onClick={() => void run('Display name updated', () => patchUser(user.id, { displayName: name.trim() }))}
          >
            Save
          </Button>
        </section>

        <section className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(user.isAdmin ? 'Admin removed' : 'Admin granted', () =>
                patchUser(user.id, { isAdmin: !user.isAdmin }),
              )
            }
          >
            {user.isAdmin ? 'Remove admin' : 'Make admin'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(user.isDisabled ? 'Account enabled' : 'Account disabled', () =>
                patchUser(user.id, { isDisabled: !user.isDisabled }),
              )
            }
          >
            {user.isDisabled ? 'Enable account' : 'Disable account'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || user.activeSessionCount === 0}
            onClick={() =>
              void run('Sessions revoked', async () => {
                await revokeSessions(user.id)
                return getUser(user.id) // refresh the row so the session count updates
              })
            }
          >
            Revoke sessions ({user.activeSessionCount})
          </Button>
        </section>

        <section className="flex items-end gap-2">
          <Field
            label="Reset password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="secondary"
            disabled={busy || newPassword.length < 8}
            onClick={() =>
              void run('Password reset — the account’s sessions were revoked', async () => {
                await setPassword(user.id, { newPassword })
                setNewPassword('')
              })
            }
          >
            Reset
          </Button>
        </section>

        <section>
          <div className="text-sm font-medium text-text-muted">Adjust rating</div>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <select
              aria-label="Rating category"
              value={ratingCat}
              onChange={(e) => setRatingCat(e.target.value as typeof ratingCat)}
              className="rounded-md bg-surface-sunken px-3 py-2 text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {TIME_CONTROL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
            <Field
              label="Rating"
              type="number"
              value={ratingValue}
              onChange={(e) => setRatingValue(e.target.value)}
              className="w-28"
            />
            <Field
              label="Games (optional)"
              type="number"
              min={0}
              value={ratingGames}
              onChange={(e) => setRatingGames(e.target.value)}
              className="w-36"
            />
            <Button
              variant="secondary"
              disabled={busy || ratingValue === '' || Number.isNaN(Number(ratingValue))}
              onClick={() =>
                void run('Rating updated', () =>
                  setRating(user.id, {
                    category: ratingCat,
                    rating: Number(ratingValue),
                    gamesPlayed: ratingGames === '' ? undefined : Number(ratingGames),
                  }),
                )
              }
            >
              Set
            </Button>
          </div>
          <p className="mt-1 text-xs text-text-subtle">
            Current: {user.ratings.map((r) => `${r.category} ${r.rating}/${r.gamesPlayed}`).join(' · ')}
          </p>
        </section>
      </div>

      <DialogFooter>
        {confirmDelete ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setErr(null)
                try {
                  await deleteUser(user.id)
                  onDeleted()
                } catch (e) {
                  setErr(errText(e))
                  setBusy(false)
                }
              }}
            >
              Delete permanently
            </Button>
          </>
        ) : (
          <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete account…
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit = email.trim() !== '' && password.length >= 8 && displayName.trim() !== ''

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await createUser({ email: email.trim(), password, displayName: displayName.trim(), isAdmin })
      onCreated()
    } catch (e) {
      setErr(errText(e))
      setBusy(false)
    }
  }

  return (
    <DialogContent title="New user" size="sm">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit && !busy) void submit()
        }}
      >
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, including a digit."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Grant admin access
        </label>
        {err && <p className="text-sm text-danger">{err}</p>}
        <DialogFooter>
          <Button type="submit" disabled={!canSubmit || busy}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
