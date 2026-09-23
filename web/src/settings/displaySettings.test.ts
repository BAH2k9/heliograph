import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_SETTINGS, migrateDisplaySettings, useDisplaySettings } from './displaySettings'

describe('useDisplaySettings', () => {
  beforeEach(() => {
    useDisplaySettings.getState().reset()
  })

  it('starts at the defaults', () => {
    const { laser, animation } = useDisplaySettings.getState()
    expect({ laser, animation }).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })

  it('setLaser patches individual fields and leaves the rest', () => {
    useDisplaySettings.getState().setLaser({ speed: 25 })
    expect(useDisplaySettings.getState().laser.speed).toBe(25)
    expect(useDisplaySettings.getState().laser.bulletLength).toBe(
      DEFAULT_DISPLAY_SETTINGS.laser.bulletLength,
    )
  })

  it('setAnimation patches timing fields', () => {
    useDisplaySettings.getState().setAnimation({ deathMs: 900 })
    expect(useDisplaySettings.getState().animation.deathMs).toBe(900)
    expect(useDisplaySettings.getState().animation.moveMs).toBe(
      DEFAULT_DISPLAY_SETTINGS.animation.moveMs,
    )
  })

  it('reset restores every field', () => {
    useDisplaySettings.getState().setLaser({ speed: 1, coreColor: '#000000' })
    useDisplaySettings.getState().setAnimation({ moveMs: 0 })
    useDisplaySettings.getState().reset()
    const { laser, animation } = useDisplaySettings.getState()
    expect({ laser, animation }).toEqual(DEFAULT_DISPLAY_SETTINGS)
  })
})

describe('migrateDisplaySettings', () => {
  const v1Save = {
    laser: {
      bulletLength: 2,
      speed: 20,
      glowColor: '#ff0000',
      glowOpacity: 0.4,
      glowWidth: 0.5,
      coreColor: '#ffeeee',
      coreWidth: 0.2,
    },
    animation: { moveMs: 100, deathMs: 300, keepDeathMs: 600 },
  }

  it('drops a version-1 save’s beam colours and keeps the rest', () => {
    const migrated = migrateDisplaySettings(v1Save, 1)
    expect(migrated.laser).toEqual({ bulletLength: 2, speed: 20, glowWidth: 0.5, coreWidth: 0.2 })
    expect(migrated.animation).toEqual(v1Save.animation)
  })

  it('leaves a current-version save alone', () => {
    expect(migrateDisplaySettings(v1Save, 2)).toEqual(v1Save)
  })

  it('rehydrates an old save with the new gold beam', async () => {
    localStorage.setItem('heliograph.displaySettings', JSON.stringify({ state: v1Save, version: 1 }))
    await useDisplaySettings.persist.rehydrate()
    const { laser } = useDisplaySettings.getState()
    expect(laser.glowColor).toBe(DEFAULT_DISPLAY_SETTINGS.laser.glowColor)
    expect(laser.coreColor).toBe(DEFAULT_DISPLAY_SETTINGS.laser.coreColor)
    expect(laser.glowOpacity).toBe(DEFAULT_DISPLAY_SETTINGS.laser.glowOpacity)
    expect(laser.speed).toBe(20)
    localStorage.removeItem('heliograph.displaySettings')
    useDisplaySettings.getState().reset()
  })
})
