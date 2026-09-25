import { useId, useState } from 'react'
import type { NewGameOptions } from '../api/client'
import { DEFAULT_LAYOUT, RULESETS, layoutsFor } from '../game/gamePresets'
import { Button } from '../ui/Button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '../ui/Dialog'

// Mount fresh per open (App keys this on the setup mode), so local state starts from the props.

const SELECT_CLASS =
  'w-full rounded-md bg-surface-sunken px-3 py-2 text-sm text-text outline-none ring-1 ring-border focus:ring-2 focus:ring-accent'

/**
 * Scoped to Local Play only — a game against another person starts from a friend invite
 * (`InvitePlayScreen`, `/play/invite`), which has its own ruleset/layout/time-control pickers.
 * Local play stays clockless, so this dialog has no time-control concept.
 */
export function NewGameDialog({
  open,
  actionLabel,
  initialRuleset = 'FixedSun',
  initialLayout = DEFAULT_LAYOUT,
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
  const rulesetId = useId()
  const layoutId = useId()
  const [ruleset, setRulesetState] = useState(initialRuleset)
  const [layout, setLayout] = useState(() => {
    const options = layoutsFor(initialRuleset)
    return options.some((l) => l.id === initialLayout) ? initialLayout : options[0].id
  })

  // Switching ruleset keeps the chosen setup: every setup is playable under every ruleset (the
  // server derives the rotating-laser board from the same named setup).
  function setRuleset(next: string) {
    setRulesetState(next)
  }

  const chosen = RULESETS.find((r) => r.id === ruleset) ?? RULESETS[0]
  const layoutOptions = layoutsFor(chosen.id)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title={actionLabel}>
        <div className="flex flex-col gap-1">
          <label htmlFor={rulesetId} className="text-sm font-medium text-text-muted">
            Ruleset
          </label>
          <select
            id={rulesetId}
            value={ruleset}
            onChange={(e) => setRuleset(e.target.value)}
            className={SELECT_CLASS}
          >
            {RULESETS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-subtle">{chosen.blurb}</p>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor={layoutId} className="text-sm font-medium text-text-muted">
            Layout
          </label>
          <select
            id={layoutId}
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            className={SELECT_CLASS}
          >
            {layoutOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={() => onConfirm({ ruleset: chosen.id, layout })}>
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
