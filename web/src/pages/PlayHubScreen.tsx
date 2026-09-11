import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../authStore'
import { RULESETS, layoutsFor } from '../game/gamePresets'
import { TIME_CONTROL_CATEGORIES, type TimeControlPreset } from '../game/timeControls'
import { useGame } from '../store'
import { Button } from '../ui/Button'

/**
 * The time-control-first play surface for multiplayer rooms, at `/play/new`. Replaces the old
 * "Host Game" modal: four big category cards (Bullet/Blitz/Rapid/Daily) are the primary
 * navigation, each showing its fixed presets as the main call to action. Ruleset/Layout — the
 * old modal's whole job — is demoted to a collapsed "Advanced options" disclosure, because the
 * time control is the headline decision here, not the variant.
 *
 * Picking a preset calls `createRoom({ timeControl, ruleset, layout })` directly (no
 * intermediate confirm step — the preset button *is* the confirm). `timeControl`'s wire name
 * (see `game/timeControls.ts`) is confirmed against the backend's BE-2 contract; `createRoom`'s
 * `timeControl` field is optional, so this screen degrades to an untimed room if BE-2 hasn't
 * deployed yet.
 *
 * No longer the primary `/play` entry point for a logged-in account — `/play/invite`
 * (`plans/07-friend-invites-matches.md`) is, since a friend-invite match never needs to show
 * either side a join code. This screen (and the room code it hands back) stays reachable as the
 * secondary "play with a link" option, which is the only invite path a guest has.
 */
export function PlayHubScreen() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
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
    <div className="min-h-screen bg-surface px-4 py-6 text-text sm:px-10 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Play with a link</h1>
          <p className="mt-1 text-sm text-text-muted">
            Pick a time control to host a room, then share the code or link with whoever's joining.
          </p>
          {user && (
            <p className="mt-2 text-sm text-text-muted">
              Playing a friend?{' '}
              <Link to="/play/invite" className="text-accent underline">
                Send them a real-time invite instead
              </Link>{' '}
              — no code needed.
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TIME_CONTROL_CATEGORIES.map((cat) => (
            <section
              key={cat.id}
              className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4 ring-1 ring-border"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-accent">
                  <CategoryIcon id={cat.id} />
                </span>
                <div>
                  <h2 className="text-base font-semibold">{cat.id}</h2>
                  <p className="text-xs text-text-muted">{cat.blurb}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {cat.presets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void pickPreset(preset)}
                    className="tabular-nums font-semibold"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-surface-raised ring-1 ring-border">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            <span>Advanced options</span>
            <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>
              <ChevronIcon />
            </span>
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-4 border-t border-border px-4 py-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-text-muted" htmlFor="hub-ruleset">
                  Ruleset
                </label>
                <select
                  id="hub-ruleset"
                  value={ruleset}
                  onChange={(e) => setRuleset(e.target.value)}
                  className="w-full max-w-xs rounded-md bg-surface-sunken px-3 py-2 text-sm text-text outline-none ring-1 ring-border focus:ring-2 focus:ring-accent"
                >
                  {RULESETS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-muted">{chosenRuleset.blurb}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-text-muted" htmlFor="hub-layout">
                  Layout
                </label>
                <select
                  id="hub-layout"
                  value={layout}
                  onChange={(e) => setLayout(e.target.value)}
                  className="w-full max-w-xs rounded-md bg-surface-sunken px-3 py-2 text-sm text-text outline-none ring-1 ring-border focus:ring-2 focus:ring-accent"
                >
                  {layoutOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
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
