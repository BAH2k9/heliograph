import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../authStore'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '../ui/Dialog'
import { Field } from '../ui/Field'

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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={isRegister ? 'Register' : 'Log in'}
        hideTitle
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="mb-4 flex gap-1 rounded-md bg-surface-sunken p-1 text-sm">
          <button type="button" onClick={() => switchMode('login')} className={tabClass(!isRegister)}>
            Log In
          </button>
          <button type="button" onClick={() => switchMode('register')} className={tabClass(isRegister)}>
            Register
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          {isRegister && (
            <Field
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              autoFocus
              autoComplete="nickname"
            />
          )}

          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!isRegister}
            autoComplete="email"
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            hint={isRegister ? 'At least 8 characters, including a digit.' : undefined}
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={busy || !canSubmit}>
              {isRegister ? 'Register' : 'Log In'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function tabClass(active: boolean): string {
  return cn(
    'flex-1 rounded px-3 py-1.5 font-medium transition-colors',
    active ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text',
  )
}
