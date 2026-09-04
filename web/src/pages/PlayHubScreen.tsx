import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RULESETS, layoutsFor } from '../game/gamePresets'
import { TIME_CONTROL_CATEGORIES, type TimeControlPreset } from '../game/timeControls'
import { useGame } from '../store'

/**
 * The time-control-first play surface for multiplayer rooms, at `/play/new`. Replaces the old
 * "Host Game" modal: four big category cards (Bullet/Blitz/Rapid/Daily) are the primary
 * navigation, each showing its fixed presets as the main call to action. Ruleset/Layout — the
 * old modal's whole job — is demoted to a collapsed "Advanced options" disclosure, because the
 * time control is the headline decision here, not the variant.
 *
 * Picking a preset calls `createRoom({ timeControl, ruleset, layout })` directly (no
 * intermediate confirm step — the preset button *is* the confirm). `timeControl` is currently a
 * best-guess wire name (see `game/timeControls.ts`) pending the backend session's contract
 * message; `createRoom`'s `timeControl` field is optional and the server ignores/degrades
 * gracefully if it doesn't recognize it yet, so this screen works standalone before BE-2 ships.
 */
export function PlayHubScreen() {
  const navigate = useNavigate()
  const createRoom = useGame((s) => s.createRoom)
  const busy = useGame((s) => s.busy)

  const [ruleset, setRulesetState] = useState('Classic')
  const [layout, setLayout] = useState('Classic')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  function setRuleset(next: string) {
    setRulesetState(next)
    setLayout(layoutsFor(next)[0].id)
  }

  async function pickPreset(preset: TimeControlPreset) {
    if (busy) return
    await createRoom({ timeControl: preset.wireName, ruleset, layout })
    if (!useGame.getState().error) navigate('/play')
  }

  const chosenRuleset = RULESETS.find((r) => r.id === ruleset) ?? RULESETS[0]
  const layoutOptions = layoutsFor(chosenRuleset.id)

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100 sm:p-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">Play</h1>
          <p className="mt-1 text-sm text-slate-400">Pick a time control to host a room.</p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TIME_CONTROL_CATEGORIES.map((cat) => (
            <section
              key={cat.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-800/60 p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sky-400">
                  <CategoryIcon id={cat.id} />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{cat.id}</h2>
                  <p className="text-xs text-slate-400">{cat.blurb}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {cat.presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={busy}
                    onClick={() => void pickPreset(preset)}
                    className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold tabular-nums text-slate-100 ring-1 ring-slate-700 hover:bg-sky-600 hover:ring-sky-500 disabled:opacity-40"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-800/40">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-slate-300 hover:text-white"
          >
            <span>Advanced options</span>
            <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>
              <ChevronIcon />
            </span>
          </button>

          {advancedOpen && (
            <div className="border-t border-slate-800 px-5 py-4">
              <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="hub-ruleset">
                Ruleset
              </label>
              <select
                id="hub-ruleset"
                value={ruleset}
                onChange={(e) => setRuleset(e.target.value)}
                className="mb-2 w-full max-w-xs rounded bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-sky-500"
              >
                {RULESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mb-4 text-xs text-slate-400">{chosenRuleset.blurb}</p>

              <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="hub-layout">
                Layout
              </label>
              <select
                id="hub-layout"
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                className="w-full max-w-xs rounded bg-slate-900 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-sky-500"
              >
                {layoutOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function CategoryIcon({ id }: { id: 'Bullet' | 'Blitz' | 'Rapid' | 'Daily' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (id === 'Bullet') {
    return (
      <svg {...common} className="h-5 w-5">
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
      </svg>
    )
  }
  if (id === 'Blitz') {
    return (
      <svg {...common} className="h-5 w-5">
        <circle cx="12" cy="13" r="7" />
        <path d="M12 9v4l3 2" />
        <path d="M9 2h6" />
      </svg>
    )
  }
  if (id === 'Rapid') {
    return (
      <svg {...common} className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" />
      </svg>
    )
  }
  return (
    <svg {...common} className="h-5 w-5">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  )
}
