import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_SETTINGS, useDisplaySettings } from './displaySettings'

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
