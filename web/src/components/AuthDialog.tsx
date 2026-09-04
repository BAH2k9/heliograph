import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../authStore'

// Min 8 chars + a digit — mirrors the backend's registration policy (no uppercase/special-char
// requirement). Checked client-side only to avoid an obviously-doomed round trip; the server is
// still the source of truth.
const PASSWORD_OK = /^(?=.*\d).{8,}$/

// Mount fresh per open (the caller keys this on the open/closed state), so fields start blank.
export function AuthDialog({
  open,
  initialMode = 'login',
  onClose,
}: {
  open: boolean
  initialMode?: 'login' | 'register'
  onClose: () => void
}) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  const busy = useAuth((s) => s.busy)
  const error = useAuth((s) => s.error)
  const login = useAuth((s) => s.login)
  const register = useAuth((s) => s.register)
  const dismissError = useAuth((s) => s.dismissError)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isRegister = mode === 'register'
  const canSubmit =
    email.trim() !== '' && (isRegister ? PASSWORD_OK.test(password) && displayName.trim() !== '' : password !== '')

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    dismissError()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const ok = isRegister ? await register(email, password, displayName.trim()) : await login(email, password)
    if (ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-slate-800 p-5 text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isRegister ? 'Register' : 'Log in'}
      >
        <div className="mb-4 flex gap-1 rounded bg-slate-900 p-1 text-sm">
          <button type="button" onClick={() => switchMode('login')} className={tabClass(!isRegister)}>
            Log In
          </button>
          <button type="button" onClick={() => switchMode('register')} className={tabClass(isRegister)}>
            Register
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)}>
          {isRegister && (
            <>
              <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="auth-display-name">
                Display name
              </label>
              <input
                id="auth-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
                autoFocus
                autoComplete="nickname"
                className="mb-3 w-full rounded bg-slate-900 px-3 py-2 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
              />
            </>
          )}

          <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!isRegister}
            autoComplete="email"
            className="mb-3 w-full rounded bg-slate-900 px-3 py-2 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
          />

          <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            className="w-full rounded bg-slate-900 px-3 py-2 outline-none ring-1 ring-slate-700 focus:ring-sky-500"
          />
          {isRegister && <p className="mb-4 mt-1 text-xs text-slate-400">At least 8 characters, including a digit.</p>}
          {!isRegister && <div className="mb-4" />}

          {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
            >
              {isRegister ? 'Register' : 'Log In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function tabClass(active: boolean): string {
  return [
    'flex-1 rounded px-3 py-1.5 font-medium',
    active ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200',
  ].join(' ')
}
