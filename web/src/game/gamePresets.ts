// Ruleset + starting-layout presets offered when creating a game. Shared by `NewGameDialog`
// (Local Play), `BotGameDialog`, `InvitePlayScreen` and `PlayHubScreen`'s "Advanced options"
// disclosure (multiplayer rooms) so the surfaces can never drift out of sync on what
// rulesets/layouts exist.

/**
 * Ruleset presets. Internals hold individual flags; the UI only ever offers named presets. `id` is
 * the server's identifier and is sent verbatim; players only ever see `label` and `blurb`.
 */
export const RULESETS = [
  {
    id: 'Classic',
    label: 'Fixed Sun',
    blurb: "Each side's beam fires from a fixed corner. Bastions stand two high and can be split apart or stacked again.",
  },
  {
    id: 'Khet2',
    label: 'Turning Sun',
    blurb: 'A Heliostat sits in each corner, and turning it counts as your move. Sentinels, shielded on their front face, take the place of Bastions.',
  },
] as const

/** What a ruleset is called on screen. Falls back to the id for a name this client doesn't know. */
export function rulesetLabel(id: string): string {
  return RULESETS.find((r) => r.id === id)?.label ?? id
}

/**
 * The starting setups — mirrors `BoardLayouts` (↔ `Khet.Engine/BoardLayouts.cs`). Every setup is
 * playable under every ruleset: the server derives the rotating-laser board from the same named
 * setup, so the choice of layout no longer depends on the ruleset.
 */
export const LAYOUTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'Dawn', label: 'Dawn' },
  { id: 'Zenith', label: 'Zenith' },
  { id: 'Dusk', label: 'Dusk' },
]

/** The setup a new game starts on unless the player picks another (`BoardLayouts.DefaultName`). */
export const DEFAULT_LAYOUT = 'Dawn'

/** The layouts offered for a ruleset — the same three for every ruleset. */
export function layoutsFor(ruleset: string): ReadonlyArray<{ id: string; label: string }> {
  void ruleset
  return LAYOUTS
}

/** Whether `layout` is a setup the server still offers (older games may carry a retired name). */
export function isKnownLayout(layout: string): boolean {
  return LAYOUTS.some((l) => l.id === layout)
}

/**
 * `layout` if it's still offered, else the default. For re-using a finished game's layout
 * ("Play again") — a game stored before the current setups existed carries a retired name the
 * server would reject.
 */
export function playableLayout(layout: string): string {
  return isKnownLayout(layout) ? layout : DEFAULT_LAYOUT
}
