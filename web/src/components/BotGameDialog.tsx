import { useId, useState } from 'react'
import type { BotDifficulty } from '../api/types'
import type { CreateBotGameOptions } from '../api/client'
import { RULESETS, layoutsFor } from '../game/gamePresets'
import { Button } from '../ui/Button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '../ui/Dialog'

const SELECT_CLASS =
  'w-full rounded-md bg-surface-sunken px-3 py-2 text-sm text-text outline-none ring-1 ring-border focus:ring-2 focus:ring-accent'

const DIFFICULTIES: { id: BotDifficulty; label: string; blurb: string }[] = [
  { id: 'Easy', label: 'Easy', blurb: 'Random legal moves — good for learning the board.' },
  { id: 'Medium', label: 'Medium', blurb: 'Looks a couple of moves ahead. A real fight.' },
  { id: 'Hard', label: 'Hard', blurb: "Plays deeper, punishes mistakes. Bring your A-game." },
]

/**
 * Entry point for "play the bot" (`plans/08-bot-opponent.md`), alongside `NewGameDialog` (local
 * play) and `PlayHubScreen` (rooms). Bot games are always untimed, unrated and anonymous — same
 * as local play — so this only asks for difficulty plus the same ruleset/layout choice
 * `NewGameDialog` offers; there's no seat picker in v1 (the human is always P1).
 */
export function BotGameDialog({
  open,
  initialRuleset = 'Classic',
  initialLayout = 'Classic',
  onConfirm,
  onClose,
}: {
  open: boolean
  initialRuleset?: string
  initialLayout?: string
  onConfirm: (options: CreateBotGameOptions) => void
  onClose: () => void
}) {
  const rulesetId = useId()
  const layoutId = useId()
  const [difficulty, setDifficulty] = useState<BotDifficulty>('Medium')
  const [ruleset, setRulesetState] = useState(initialRuleset)
  const [layout, setLayout] = useState(() => {
    const options = layoutsFor(initialRuleset)
    return options.some((l) => l.id === initialLayout) ? initialLayout : options[0].id
  })

  function setRuleset(next: string) {
    setRulesetState(next)
    setLayout(layoutsFor(next)[0].id)
  }

  const chosen = RULESETS.find((r) => r.id === ruleset) ?? RULESETS[0]
  const layoutOptions = layoutsFor(chosen.id)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Play the bot">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-muted">Difficulty</span>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDifficulty(d.id)}
                aria-pressed={difficulty === d.id}
                className={`rounded-md px-2 py-2 text-sm font-medium ring-1 transition-colors ${
                  difficulty === d.id
                    ? 'bg-accent/15 text-accent ring-accent'
                    : 'bg-surface-sunken text-text-muted ring-border hover:text-text'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-subtle">{DIFFICULTIES.find((d) => d.id === difficulty)?.blurb}</p>
        </div>

        <div className="mt-4 flex flex-col gap-1">
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
          <Button size="sm" onClick={() => onConfirm({ difficulty, ruleset: chosen.id, layout })}>
            Play {difficulty}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
