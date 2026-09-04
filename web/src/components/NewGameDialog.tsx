import { useEffect, useState } from 'react'
import type { NewGameOptions } from '../api/client'
import { RULESETS, layoutsFor } from '../game/gamePresets'

// Mount fresh per open (App keys this on the setup mode), so local state starts from the props.

/**
 * Scoped to Local Play only — multiplayer room creation now goes through `PlayHubScreen`'s
 * time-control-first flow (`/play/new`), which has its own "Advanced options" disclosure for
 * ruleset/layout. Local play stays clockless, so this dialog has no time-control concept.
 */
export function NewGameDialog({
  open,
  actionLabel,
  initialRuleset = 'Classic',
  initialLayout = 'Classic',
  onConfirm,
  onClose,
}: {
  open: boolean
  actionLabel: string
  initialRuleset?: string
  initialLayout?: string
  onConfirm: (options: NewGameOptions) => void
  onClose: () => void
}) {
  const [ruleset, setRulesetState] = useState(initialRuleset)
  const [layout, setLayout] = useState(() => {
    const options = layoutsFor(initialRuleset)
    return options.some((l) => l.id === initialLayout) ? initialLayout : options[0].id
  })

  // Switching ruleset resets the layout to that ruleset's default — Imhotep/Dynasty aren't
  // Khet 2.0 boards, and Khet2Classic isn't a Classic one.
  function setRuleset(next: string) {
    setRulesetState(next)
    setLayout(layoutsFor(next)[0].id)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const chosen = RULESETS.find((r) => r.id === ruleset) ?? RULESETS[0]
  const layoutOptions = layoutsFor(chosen.id)

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
        aria-label="New game options"
      >
        <h2 className="mb-4 text-lg font-semibold">{actionLabel}</h2>

        <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="ruleset">
          Ruleset
        </label>
        <select
          id="ruleset"
          value={ruleset}
          onChange={(e) => setRuleset(e.target.value)}
          className="mb-2 w-full rounded bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-sky-500"
        >
          {RULESETS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="mb-4 text-xs text-slate-400">{chosen.blurb}</p>

        <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="layout">
          Layout
        </label>
        <select
          id="layout"
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
          className="mb-4 w-full rounded bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-sky-500"
        >
          {layoutOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ ruleset: chosen.id, layout })}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
