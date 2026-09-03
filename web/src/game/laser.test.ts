import { describe, expect, it } from 'vitest'
import type { LaserSegment } from '../api/types'
import { DEFAULT_DISPLAY_SETTINGS } from '../settings/displaySettings'
import { beamDurationMs, beamPoints, pathLength } from './laser'

describe('beamPoints', () => {
  it('starts at the emitter edge, then centre then exit edge per segment', () => {
    const segs: LaserSegment[] = [
      { row: 7, col: 9, enter: 'Bottom', exit: 'Top' },
      { row: 6, col: 9, enter: 'Bottom', exit: 'Top' },
    ]
    expect(beamPoints(segs)).toEqual([
      { x: 9.5, y: 8 }, // enter Bottom of (7,9)
      { x: 9.5, y: 7.5 }, // centre (7,9)
      { x: 9.5, y: 7 }, // exit Top of (7,9)
      { x: 9.5, y: 6.5 }, // centre (6,9)
      { x: 9.5, y: 6 }, // exit Top of (6,9)
    ])
  })

  it('omits the trailing edge point when the beam stops in a square', () => {
    const segs: LaserSegment[] = [{ row: 4, col: 9, enter: 'Bottom', exit: null }]
    expect(beamPoints(segs)).toEqual([
      { x: 9.5, y: 5 },
      { x: 9.5, y: 4.5 },
    ])
  })
})

describe('pathLength', () => {
  it('sums the segment lengths, corners included', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 4, y: 3 },
    ]
    expect(pathLength(points)).toBe(7)
  })
})

describe('beamDurationMs', () => {
  it('scales with (path length + bullet length) / speed so the bullet moves at a constant rate', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ]
    const { speed, bulletLength } = DEFAULT_DISPLAY_SETTINGS.laser
    expect(beamDurationMs(points, { speed, bulletLength })).toBeCloseTo(
      ((10 + bulletLength) / speed) * 1000,
    )
  })

  it('takes longer at a lower speed', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 6 },
    ]
    const fast = beamDurationMs(points, { speed: 20, bulletLength: 1 })
    const slow = beamDurationMs(points, { speed: 8, bulletLength: 1 })
    expect(slow).toBeGreaterThan(fast)
  })
})
