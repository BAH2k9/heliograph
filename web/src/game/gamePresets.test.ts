import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, LAYOUTS, RULESETS, isKnownLayout, layoutsFor, playableLayout } from './gamePresets'

describe('gamePresets', () => {
  it('offers exactly Dawn, Zenith and Dusk, under every ruleset', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual(['Dawn', 'Zenith', 'Dusk'])
    for (const r of RULESETS) expect(layoutsFor(r.id)).toEqual(LAYOUTS)
    expect(layoutsFor('unknown-ruleset')).toEqual(LAYOUTS)
  })

  it('defaults to Dawn, matching the server', () => {
    expect(DEFAULT_LAYOUT).toBe('Dawn')
    expect(isKnownLayout(DEFAULT_LAYOUT)).toBe(true)
  })

  it('maps a retired layout name to the default and keeps a current one', () => {
    expect(isKnownLayout('RetiredLayout')).toBe(false)
    expect(playableLayout('RetiredLayout')).toBe('Dawn')
    expect(playableLayout('Dusk')).toBe('Dusk')
  })
})
