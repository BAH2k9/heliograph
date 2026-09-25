import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../authStore'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'

/**
 * The whole app sits behind login now (accounts are admin-created only — see `AuthController`'s
 * doc comment, there's no self-registration). `AppLayout` redirects any unauthenticated route here;
 * this page redirects back to `/` once a session exists, so it's never shown to someone already
 * logged in (e.g. a stale bookmark to `/login`).
 */
export function LoginPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  const user = useAuth((s) => s.user)
  const busy = useAuth((s) => s.busy)
  const error = useAuth((s) => s.error)
  const logIn = useAuth((s) => s.login)
  const navigate = useNavigate()

  if (user) return <Navigate to="/" replace />

  const canSubmit = login.trim() !== '' && password !== ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const ok = await logIn(login, password)
    if (ok) navigate('/')
  }

  return (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-surface px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo withWordmark size="lg" />
          <p className="text-sm text-text-muted">Log in to play.</p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          {/* Email or display name — the server tries it as an email first (see
              `AuthService.LoginAsync`). `username` is the autocomplete token password managers
              key a login identifier on; no auto-capitalize/correct, since a display name is typed
              verbatim (the match is case-insensitive anyway). */}
          <Field
            label="Email or display name"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" size="md" className="mt-2" disabled={busy || !canSubmit}>
            Log In
          </Button>
        </form>
      </div>
    </div>
  )
}
