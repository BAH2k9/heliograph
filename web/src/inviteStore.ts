import { create } from 'zustand'
import { acceptInvite, ApiError, declineInvite, listPendingInvites } from './api/client'
import type { PendingInvite } from './api/authTypes'
import type { RoomResponse } from './api/types'

/**
 * Pending match-invites (`plans/07-friend-invites-matches.md`) — deliberately its own store
 * rather than a `store.ts` addition, same reasoning as `FriendsPage` keeping friend-list state
 * out of it: an invite list has nothing to do with an in-progress game, and `store.ts` is
 * already large (see `web/CLAUDE.md`).
 *
 * `refresh()` is the single source of truth for `pending` — it's called on mount and whenever
 * `realtime.ts`'s `inviteReceived` push fires. The push payload itself is never read directly
 * (it carries only an id); the discipline here matches every other hub event in this app.
 */
interface InviteStore {
  pending: PendingInvite[]
  loaded: boolean
  error: string | null
  /** Invite id currently being accepted/declined, or null. Drives per-row busy state. */
  busyId: string | null

  refresh: () => Promise<void>
  /** Accepts an invite and returns the resulting room to join, or null on failure (`error` is
   *  set). Removes the invite from `pending` optimistically either way — a stale/already-
   *  resolved invite (404/410) shouldn't linger in the list either. */
  accept: (inviteId: string) => Promise<RoomResponse | null>
  decline: (inviteId: string) => Promise<void>
  dismissError: () => void
  /** Test/reset hook — clears everything back to the initial (unloaded) state. */
  reset: () => void
}

function errText(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e)
}

export const useInvites = create<InviteStore>()((set, get) => ({
  pending: [],
  loaded: false,
  error: null,
  busyId: null,

  refresh: async () => {
    try {
      const pending = await listPendingInvites()
      set({ pending, loaded: true, error: null })
    } catch (e) {
      set({ error: errText(e) })
    }
  },

  accept: async (inviteId) => {
    set({ busyId: inviteId, error: null })
    try {
      const room = await acceptInvite(inviteId)
      set({ pending: get().pending.filter((i) => i.id !== inviteId), busyId: null })
      return room
    } catch (e) {
      set({
        pending: get().pending.filter((i) => i.id !== inviteId),
        busyId: null,
        error: errText(e),
      })
      return null
    }
  },

  decline: async (inviteId) => {
    set({ busyId: inviteId, error: null })
    try {
      await declineInvite(inviteId)
    } catch (e) {
      set({ error: errText(e) })
    } finally {
      set({ pending: get().pending.filter((i) => i.id !== inviteId), busyId: null })
    }
  },

  dismissError: () => set({ error: null }),

  reset: () => set({ pending: [], loaded: false, error: null, busyId: null }),
}))
