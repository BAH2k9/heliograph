import { useEffect } from 'react'
import { DisplaySettingsPanel } from './DisplaySettingsPanel'

/** A small modal. One tab for now — Display Settings. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="w-full max-w-lg rounded-xl bg-slate-800 p-5 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1 border-b border-slate-700 text-sm">
          <span className="border-b-2 border-amber-400 px-3 pb-2 font-medium text-slate-100">
            Display Settings
          </span>
        </div>

        <DisplaySettingsPanel />
      </div>
    </div>
  )
}
