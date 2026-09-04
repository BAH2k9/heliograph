import { useEffect, useState } from 'react'

// Mount fresh per open (the caller keys this on the open/closed state), so `code` starts blank.
export function JoinGameDialog({
  open,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  busy: boolean
  onConfirm: (code: string) => void
  onClose: () => void
}) {
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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
        aria-label="Join game"
      >
        <h2 className="mb-4 text-lg font-semibold">Join Game</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) onConfirm(code)
          }}
        >
          <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="join-code">
            Room code
          </label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="code"
            maxLength={6}
            autoFocus
            className="mb-4 w-full rounded bg-slate-900 px-3 py-2 font-mono uppercase tracking-widest outline-none ring-1 ring-slate-700 focus:ring-sky-500"
          />

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
              disabled={busy || !code.trim()}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
            >
              Join Game
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
