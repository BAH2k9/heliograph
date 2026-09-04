import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../authStore'

/** Guards an account-only route (Profile, Leaderboard): guests bounce to the landing page. */
export function RequireAuth({ children }: { children: ReactElement }) {
  const user = useAuth((s) => s.user)
  return user ? children : <Navigate to="/" replace />
}
