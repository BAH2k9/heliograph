import { useEffect, useState } from 'react'
import {
  acceptFriendRequest,
  ApiError,
  declineFriendRequest,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  removeFriend,
  searchUsers,
  sendFriendRequest,
} from '../api/client'
import type { FriendRequestSummary, FriendSummary, UserSearchResult } from '../api/authTypes'
import { Avatar } from '../components/Avatar'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Panel } from '../ui/Panel'

const SEARCH_DEBOUNCE_MS = 300

function errText(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e)
}

/**
 * `/friends` — find/add accounts, manage incoming/outgoing requests, and the accepted friends
 * list (`backlog/06-friend-invites-friendships.md`). Deliberately its own page with local state
 * rather than a `store.ts` addition — friend-list data has nothing to do with an in-progress
 * game, and `store.ts` is already large (see `web/CLAUDE.md`).
 *
 * `discriminator` (`DisplayName#nnnn`) only ever renders on this page's rows — nowhere else in
 * the app appends it to a player's name.
 */
export function FriendsPage() {
  const [friends, setFriends] = useState<FriendSummary[] | null>(null)
  const [incoming, setIncoming] = useState<FriendRequestSummary[] | null>(null)
  const [outgoing, setOutgoing] = useState<FriendRequestSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  async function refreshLists() {
    try {
      const [f, i, o] = await Promise.all([listFriends(), listIncomingRequests(), listOutgoingRequests()])
      setFriends(f)
      setIncoming(i)
      setOutgoing(o)
      setLoadError(null)
    } catch (e) {
      setLoadError(errText(e))
    }
  }

  useEffect(() => {
    void refreshLists()
  }, [])

  // Debounced search — fires SEARCH_DEBOUNCE_MS after the user stops typing, and never for a
  // blank/whitespace-only query (the backend 400s that; there's nothing useful to show anyway).
  useEffect(() => {
    const q = query.trim()
    if (q === '') {
      setResults(null)
      setSearchError(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      searchUsers(q)
        .then((r) => {
          setResults(r)
          setSearchError(null)
        })
        .catch((e: unknown) => setSearchError(errText(e)))
        .finally(() => setSearching(false))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  const friendIds = new Set((friends ?? []).map((f) => f.userId))
  const outgoingIds = new Set((outgoing ?? []).map((r) => r.userId))

  async function addFriend(userId: string) {
    setRowBusyId(userId)
    setRowError(null)
    try {
      await sendFriendRequest(userId)
      setRequestedIds((prev) => new Set(prev).add(userId))
      await refreshLists()
    } catch (e) {
      setRowError(errText(e))
    } finally {
      setRowBusyId(null)
    }
  }

  async function accept(requestId: string) {
    setRowBusyId(requestId)
    setRowError(null)
    try {
      await acceptFriendRequest(requestId)
      await refreshLists()
    } catch (e) {
      setRowError(errText(e))
    } finally {
      setRowBusyId(null)
    }
  }

  async function decline(requestId: string) {
    setRowBusyId(requestId)
    setRowError(null)
    try {
      await declineFriendRequest(requestId)
      await refreshLists()
    } catch (e) {
      setRowError(errText(e))
    } finally {
      setRowBusyId(null)
    }
  }

  async function remove(userId: string) {
    setRowBusyId(userId)
    setRowError(null)
    try {
      await removeFriend(userId)
      setConfirmRemoveId(null)
      await refreshLists()
    } catch (e) {
      setRowError(errText(e))
    } finally {
      setRowBusyId(null)
    }
  }

  return (
    <div className="flex-1 bg-surface px-4 py-6 text-text sm:px-10 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Friends</h1>
          <p className="mt-1 text-sm text-text-muted">Find people, manage requests, and see who you play with.</p>
        </header>

        {loadError && (
          <div className="mb-4 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load your friends: {loadError}
          </div>
        )}
        {rowError && (
          <div className="mb-4 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">{rowError}</div>
        )}

        <Panel className="mb-6 p-4">
          <Field
            label="Find friends"
            placeholder="Display name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            hint="Search by display name — results show a #nnnn discriminator to tell same-named accounts apart."
          />

          <div className="mt-3">
            {searching && <p className="text-sm text-text-muted">Searching…</p>}
            {searchError && <p className="text-sm text-danger">{searchError}</p>}
            {!searching && !searchError && results && results.length === 0 && (
              <p className="text-sm text-text-muted">No accounts match “{query.trim()}”.</p>
            )}
            {results && results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((r) => {
                  const alreadyFriend = friendIds.has(r.id)
                  const alreadyRequested = outgoingIds.has(r.id) || requestedIds.has(r.id)
                  return (
                    <li key={r.id} className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2">
                      <Avatar avatarId={r.avatarId} displayName={r.displayName} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {r.displayName}
                        <span className="text-text-subtle">#{r.discriminator}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={alreadyFriend || alreadyRequested || rowBusyId === r.id}
                        onClick={() => void addFriend(r.id)}
                      >
                        {alreadyFriend ? 'Friends' : alreadyRequested ? 'Pending' : 'Add friend'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Panel>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Incoming requests</h2>
          {!incoming && !loadError && <p className="text-sm text-text-muted">Loading…</p>}
          {incoming && incoming.length === 0 && <p className="text-sm text-text-muted">No incoming requests.</p>}
          {incoming && incoming.length > 0 && (
            <ul className="flex flex-col gap-2">
              {incoming.map((req) => (
                <li key={req.requestId} className="flex items-center gap-3 rounded-md bg-surface-raised px-3 py-2 ring-1 ring-border">
                  <Avatar avatarId={req.avatarId} displayName={req.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {req.displayName}
                    <span className="text-text-subtle">#{req.discriminator}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={rowBusyId === req.requestId}
                    onClick={() => void accept(req.requestId)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rowBusyId === req.requestId}
                    onClick={() => void decline(req.requestId)}
                  >
                    Decline
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Outgoing requests</h2>
          {!outgoing && !loadError && <p className="text-sm text-text-muted">Loading…</p>}
          {outgoing && outgoing.length === 0 && <p className="text-sm text-text-muted">No outgoing requests.</p>}
          {outgoing && outgoing.length > 0 && (
            <ul className="flex flex-col gap-2">
              {outgoing.map((req) => (
                <li key={req.requestId} className="flex items-center gap-3 rounded-md bg-surface-raised px-3 py-2 ring-1 ring-border">
                  <Avatar avatarId={req.avatarId} displayName={req.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {req.displayName}
                    <span className="text-text-subtle">#{req.discriminator}</span>
                  </span>
                  <span className="text-xs text-text-subtle">Pending</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">My friends</h2>
          {!friends && !loadError && <p className="text-sm text-text-muted">Loading…</p>}
          {friends && friends.length === 0 && <p className="text-sm text-text-muted">No friends yet — search above to add one.</p>}
          {friends && friends.length > 0 && (
            <ul className="flex flex-col gap-2">
              {friends.map((f) => (
                <li key={f.userId} className="flex items-center gap-3 rounded-md bg-surface-raised px-3 py-2 ring-1 ring-border">
                  <Avatar avatarId={f.avatarId} displayName={f.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {f.displayName}
                    <span className="text-text-subtle">#{f.discriminator}</span>
                  </span>
                  {confirmRemoveId === f.userId ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={rowBusyId === f.userId} onClick={() => setConfirmRemoveId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="danger" disabled={rowBusyId === f.userId} onClick={() => void remove(f.userId)}>
                        Confirm remove
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveId(f.userId)}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
