import { create } from 'zustand'
import { acceptFriendRequest, ApiError, declineFriendRequest, listIncomingRequests } from './api/client'
import type { FriendRequestSummary } from './api/authTypes'

/**
 * Pending *incoming* friend requests, surfaced in the bell icon (`PendingInvitesTray`) alongside
 * match invites. Its own store rather than a `FriendsPage` addition, same reasoning as
 * `inviteStore`: this list needs to be visible from anywhere in the app (the bell is
 * always-mounted in `AppLayout`), not just on `/friends`.
 *
 * `refresh()` is the single source of truth for `pending` — called on mount/login and on every
 * `friendRequestReceived` hub push (never trusting the push payload itself, which carries nothing
 * — see `realtime.ts`'s doc comment).
 */
interface FriendRequestStore {
  pending: FriendRequestSummary[]
  error: string | null
  /** Request id currently being accepted/declined, or null. Drives per-row busy state. */
  busyId: string | null

  refresh: () => Promise<void>
  accept: (requestId: string) => Promise<void>
  decline: (requestId: string) => Promise<void>
  dismissError: () => void
  /** Test/reset hook — clears everything back to the initial state. */
  reset: () => void
}

function errText(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e)
}

export const useFriendRequests = create<FriendRequestStore>()((set, get) => ({
  pending: [],
  error: null,
  busyId: null,

  refresh: async () => {
    try {
      const pending = await listIncomingRequests()
      set({ pending, error: null })
    } catch (e) {
      set({ error: errText(e) })
    }
  },

  accept: async (requestId) => {
    set({ busyId: requestId, error: null })
    try {
      await acceptFriendRequest(requestId)
      set({ pending: get().pending.filter((r) => r.requestId !== requestId), busyId: null })
    } catch (e) {
      set({ error: errText(e), busyId: null })
    }
  },

  decline: async (requestId) => {
    set({ busyId: requestId, error: null })
    try {
      await declineFriendRequest(requestId)
    } catch (e) {
      set({ error: errText(e) })
    } finally {
      set({ pending: get().pending.filter((r) => r.requestId !== requestId), busyId: null })
    }
  },

  dismissError: () => set({ error: null }),

  reset: () => set({ pending: [], error: null, busyId: null }),
}))
