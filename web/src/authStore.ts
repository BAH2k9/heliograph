import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthResponse, UserProfile } from './api/authTypes'
import {
  login as apiLogin,
  logout as apiLogout,
  updateProfile as apiUpdateProfile,
  type UpdateProfileRequest,
} from './api/authClient'
import { refreshSession } from './api/refreshSession'

/**
 * Token storage: localStorage (via zustand's `persist`), matching the existing
 * `displaySettings.ts` pattern. Tradeoff: simplest option and matches the auth service's
 * response-body-token design, but is more exposed to XSS than an httpOnly cookie would be.
 * This project has no XSS-classed data at stake beyond board state, so it's a reasonable
 * default — flagging it explicitly rather than picking it silently.
 */

interface AuthStore {
  accessToken: string | null
  refreshToken: string | null
  user: UserProfile | null
  busy: boolean
  error: string | null

  login: (email: string, password: string) => Promise<boolean>
  /** `PATCH /api/auth/me` — display name and/or avatar. On success, replaces `user` with the
   *  server's returned `UserProfile` (same success/error/`busy` shape as `login`). */
  updateProfile: (patch: UpdateProfileRequest) => Promise<boolean>
  logout: () => void
  /** Applies a fresh `AuthResponse` — used after login/register and after a token refresh. */
  setSession: (res: AuthResponse) => void
  /** Silently refreshes on app boot so a reload doesn't wait for the first 401 to renew the
   *  15-minute access token, and picks up any rating change since the last session. No-ops
   *  (and does not clear the session) if there's no persisted refresh token or the call fails
   *  offline — a real revocation still surfaces via the normal `authFetch` 401 path. */
  hydrate: () => Promise<void>
  dismissError: () => void
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export const useAuth = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      busy: false,
      error: null,

      login: async (email, password) => {
        set({ busy: true, error: null })
        try {
          const res = await apiLogin(email, password)
          get().setSession(res)
          set({ busy: false })
          return true
        } catch (e) {
          set({ busy: false, error: errorText(e) })
          return false
        }
      },

      updateProfile: async (patch) => {
        set({ busy: true, error: null })
        try {
          const user = await apiUpdateProfile(patch)
          set({ user, busy: false })
          return true
        } catch (e) {
          set({ busy: false, error: errorText(e) })
          return false
        }
      },

      logout: () => {
        const { refreshToken } = get()
        if (refreshToken) void apiLogout(refreshToken)
        set({ accessToken: null, refreshToken: null, user: null, error: null })
      },

      setSession: (res) =>
        set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user }),

      hydrate: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return
        try {
          // Shared with authFetch's 401 handling — a refresh token is rotating and single-use,
          // so a concurrent request that 401s at the same moment must reuse this same call
          // rather than racing it with a second refresh attempt.
          const res = await refreshSession(refreshToken)
          get().setSession(res)
        } catch {
          /* leave the persisted session alone — a genuine revocation surfaces via authFetch */
        }
      },

      dismissError: () => set({ error: null }),
    }),
    {
      name: 'heliograph.auth',
      version: 1,
      // busy/error are transient UI state — never worth surviving a reload.
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
    },
  ),
)
