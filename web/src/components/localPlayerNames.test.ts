import { describe, expect, it } from 'vitest'
import { AVATAR_IDS } from './Avatar'
import { LOCAL_PLAYER_NAMES, bioFor, pickLocalPlayerIdentities } from './localPlayerNames'

describe('LOCAL_PLAYER_NAMES', () => {
  it('has no duplicate names', () => {
    expect(new Set(LOCAL_PLAYER_NAMES).size).toBe(LOCAL_PLAYER_NAMES.length)
  })

  it('has at least enough names to feel varied across repeated local games', () => {
    expect(LOCAL_PLAYER_NAMES.length).toBeGreaterThanOrEqual(16)
  })

  it('keeps every name short enough for the player card', () => {
    for (const name of LOCAL_PLAYER_NAMES) expect(name.length).toBeLessThanOrEqual(16)
  })

  it('gives every name a bio for the character popup', () => {
    for (const name of LOCAL_PLAYER_NAMES) expect(bioFor(name)).not.toBe('')
  })
})

describe('pickLocalPlayerIdentities', () => {
  it('always returns two distinct names and two distinct avatars, both from the known pools', () => {
    for (let i = 0; i < 50; i++) {
      const [a, b] = pickLocalPlayerIdentities()
      expect(a.displayName).not.toBe(b.displayName)
      expect(a.avatarId).not.toBe(b.avatarId)
      expect(LOCAL_PLAYER_NAMES).toContain(a.displayName)
      expect(LOCAL_PLAYER_NAMES).toContain(b.displayName)
      expect(AVATAR_IDS).toContain(a.avatarId)
      expect(AVATAR_IDS).toContain(b.avatarId)
    }
  })
})
