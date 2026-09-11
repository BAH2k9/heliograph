import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../authStore'

/** Guards the `/admin` routes: a guest or a non-admin account bounces to the landing page.
 *  `isAdmin` comes off `UserProfile` (set from the `is_admin` access-token claim) — a missing
 *  key is treated as `false`. */
export function RequireAdmin({ children }: { children: ReactElement }) {
  const user = useAuth((s) => s.user)
  return user?.isAdmin ? children : <Navigate to="/" replace />
}
