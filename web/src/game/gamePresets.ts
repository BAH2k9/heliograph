// Ruleset + starting-layout presets offered when creating a game. Shared by `NewGameDialog`
// (Local Play) and `PlayHubScreen`'s "Advanced options" disclosure (multiplayer rooms) so the
// two surfaces can never drift out of sync on what rulesets/layouts exist.

/** Ruleset presets. Internals hold individual flags; the UI only ever offers named presets. */
export const RULESETS = [
  { id: 'Classic', label: 'Classic', blurb: 'Original Khet — fixed corner laser, stacking obelisks.' },
  { id: 'Khet2', label: 'Khet 2.0', blurb: 'Rotating Sphinx laser in each corner; a turn can be a Sphinx rotation.' },
] as const

/** Starting layouts offered per ruleset — mirrors `BoardLayouts` (↔ `Khet.Engine/BoardLayouts.cs`). */
export const LAYOUTS: Record<string, ReadonlyArray<{ id: string; label: string }>> = {
  Classic: [
    { id: 'Classic', label: 'Classic' },
    { id: 'Imhotep', label: 'Imhotep' },
    { id: 'Dynasty', label: 'Dynasty' },
  ],
  Khet2: [
    { id: 'Khet2Classic', label: 'Khet2Classic' },
    { id: 'Khet2Imhotep', label: 'Khet2Imhotep' },
    { id: 'Khet2Dynasty', label: 'Khet2Dynasty' },
  ],
}

export function layoutsFor(ruleset: string) {
  return LAYOUTS[ruleset] ?? LAYOUTS.Classic
}
