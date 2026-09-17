import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, listFriends, listSentInvites, sendInvite } from '../api/client'
import type { FriendSummary } from '../api/authTypes'
import { RULESETS, layoutsFor } from '../game/gamePresets'
import { TIME_CONTROL_CATEGORIES } from '../game/timeControls'
import { Avatar } from '../components/Avatar'
import { useGame } from '../store'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'

/**
 * How often this screen polls `GET /api/invites/sent` while mounted. The `inviteAccepted` hub
 * push (`PendingInvitesTray`) is the fast path; this poll is the fallback for when that push
 * never lands — no live hub connection at the moment the invitee accepts (a slow/failed initial
 * connect, or a connection dropped by e.g. a server redeploy and never re-established), or the
 * inviter's tab having been reloaded since sending (which drops the in-memory `sentTo` state this
 * screen would otherwise rely on). The push has no replay, so without this the inviter is stuck
 * on this screen forever with no way to discover the invite was accepted.
 */
const SENT_INVITE_POLL_MS = 4000

const SELECT_CLASS =
  'w-full rounded-md bg-surface-sunken px-3 py-2 text-sm text-text outline-none ring-1 ring-border focus:ring-2 focus:ring-accent'

function errText(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e)
}

/**
 * `/play/invite` — the primary multiplayer entry point (`backlog/07-friend-invites-matches.md`):
 * pick a friend, configure the game, send a real-time invite. No join code is ever shown to
 * either side; `RoomsController`'s code create/join endpoints are untouched underneath (still
 * reachable from `PlayHubScreen` as a secondary "play with a link" option for anyone who'd
 * rather not wait on a friend accepting — there's no join-by-typed-code UI anymore, just the
 * shared link itself).
 */
export function InvitePlayScreen() {
  const navigate = useNavigate()
  const enterRoom = useGame((s) => s.enterRoom)

  const [friends, setFriends] = useState<FriendSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviteeId, setInviteeId] = useState<string | null>(null)

  const [ruleset, setRulesetState] = useState('Classic')
  const [layout, setLayout] = useState('Classic')
  const [timeControl, setTimeControl] = useState<string>('')
  const [rated, setRated] = useState(false)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const rulesetId = useId()
  const layoutId = useId()
  const timeControlId = useId()

  useEffect(() => {
    listFriends()
      .then(setFriends)
      .catch((e: unknown) => setLoadError(errText(e)))
  }, [])

  // See SENT_INVITE_POLL_MS's doc comment: the fallback for a missed `inviteAccepted` push. Safe
  // to match "any accepted invite with a room" here because the backend (`InviteService.ListSentAsync`)
  // stops returning an `Accepted` row once its own `ExpiresAtUtc` passes — otherwise this would
  // resurrect an arbitrarily old already-finished game the instant this screen mounts.
  const enteredGameIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const sent = await listSentInvites()
        const accepted = sent.find((i) => i.status === 'Accepted' && i.room)
        if (cancelled || !accepted?.room || enteredGameIds.current.has(accepted.room.gameId)) return
        enteredGameIds.current.add(accepted.room.gameId)
        await enterRoom(accepted.room)
        if (!cancelled) navigate('/play')
      } catch {
        /* transient — try again next tick */
      }
    }

    void poll()
    const interval = setInterval(() => void poll(), SENT_INVITE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enterRoom, navigate])

  function setRuleset(next: string) {
    setRulesetState(next)
    setLayout(layoutsFor(next)[0].id)
  }

  const chosenRuleset = RULESETS.find((r) => r.id === ruleset) ?? RULESETS[0]
  const layoutOptions = layoutsFor(chosenRuleset.id)

  async function send() {
    if (!inviteeId || sending) return
    setSending(true)
    setSendError(null)
    try {
      await sendInvite({
        inviteeUserId: inviteeId,
        ruleset,
        layout,
        timeControl: timeControl || undefined,
        rated,
      })
      setSentTo(inviteeId)
      setInviteeId(null)
    } catch (e) {
      setSendError(errText(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-6 text-text sm:px-10 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Challenge a friend</h1>
          <p className="mt-1 text-sm text-text-muted">
            Pick a friend, set up the game, and send an invite — they get a real-time notification
            and land straight in the room, no code needed.
          </p>
        </header>

        {sentTo && (
          <div className="mb-4 rounded-md bg-success/15 px-3 py-2 text-sm text-success">
            Invite sent — waiting for them to accept.
          </div>
        )}
        {sendError && <div className="mb-4 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">{sendError}</div>}
        {loadError && (
          <div className="mb-4 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load your friends: {loadError}
          </div>
        )}

        <Panel className="mb-6 p-4">
          <h2 className="mb-2 text-sm font-medium text-text-muted">Friend</h2>
          {!friends && !loadError && <p className="text-sm text-text-muted">Loading…</p>}
          {friends && friends.length === 0 && (
            <p className="text-sm text-text-muted">
              No friends yet — <Link to="/friends" className="text-accent underline">add one</Link> to send an
              invite.
            </p>
          )}
          {friends && friends.length > 0 && (
            <ul className="flex flex-col gap-2">
              {friends.map((f) => (
                <li key={f.userId}>
                  <button
                    type="button"
                    onClick={() => setInviteeId(f.userId)}
                    className={[
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ring-1 transition-colors',
                      inviteeId === f.userId
                        ? 'bg-accent/15 ring-accent'
                        : 'bg-surface-sunken ring-transparent hover:ring-border',
                    ].join(' ')}
                  >
                    <Avatar avatarId={f.avatarId} displayName={f.displayName} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {f.displayName}
                      <span className="text-text-subtle">#{f.discriminator}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="mb-6 flex flex-col gap-4 p-4">
          <div>
            <label htmlFor={rulesetId} className="mb-1 block text-sm font-medium text-text-muted">
              Ruleset
            </label>
            <select id={rulesetId} value={ruleset} onChange={(e) => setRuleset(e.target.value)} className={SELECT_CLASS}>
              {RULESETS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-subtle">{chosenRuleset.blurb}</p>
          </div>

          <div>
            <label htmlFor={layoutId} className="mb-1 block text-sm font-medium text-text-muted">
              Layout
            </label>
            <select id={layoutId} value={layout} onChange={(e) => setLayout(e.target.value)} className={SELECT_CLASS}>
              {layoutOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={timeControlId} className="mb-1 block text-sm font-medium text-text-muted">
              Time control
            </label>
            <select
              id={timeControlId}
              value={timeControl}
              onChange={(e) => setTimeControl(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Untimed</option>
              {TIME_CONTROL_CATEGORIES.map((cat) => (
                <optgroup key={cat.id} label={cat.id}>
                  {cat.presets.map((p) => (
                    <option key={p.wireName} value={p.wireName}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={rated}
              onChange={(e) => setRated(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Rated
          </label>
        </Panel>

        <div className="flex items-center gap-3">
          <Button disabled={!inviteeId || sending} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send invite'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/play/new')}>
            Play by code instead
          </Button>
        </div>
      </div>
    </div>
  )
}
