import { useEffect, useState } from 'react'
import type { NewGameOptions } from '../api/client'

// Mount fresh per open (App keys this on the setup mode), so local state starts from the props.

/** Ruleset presets. Internals hold individual flags; the UI only ever offers named presets. */
const RULESETS = [
  { id: 'Classic', label: 'Classic', blurb: 'Original Khet — fixed corner laser, stacking obelisks.' },
  { id: 'Khet2', label: 'Khet 2.0', blurb: 'Rotating Sphinx laser in each corner; a turn can be a Sphinx rotation.' },
] as const

/** Starting layouts offered per ruleset. Khet 2.0 has one entry today; more can join it later. */
const LAYOUTS: Record<string, ReadonlyArray<{ id: string; label: string }>> = {
  Classic: [
    { id: 'Classic', label: 'Classic' },
    { id: 'Imhotep', label: 'Imhotep' },
    { id: 'Dynasty', label: 'Dynasty' },
  ],
  Khet2: [{ id: 'Khet2Classic', label: 'Khet2Classic' }],
}

function layoutsFor(ruleset: string) {
  return LAYOUTS[ruleset] ?? LAYOUTS.Classic
}

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
