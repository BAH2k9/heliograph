import { describe, expect, it } from 'vitest'
import { applyRoomParams, readRoomParams } from './roomUrl'

describe('roomUrl', () => {
  it('round-trips a full room state through the URL', () => {
    const params = { gameId: 'abc-123', seat: 'P2' as const, code: 'QW7RT2' }
    const url = applyRoomParams(new URL('http://localhost/'), params)

    expect(url.searchParams.get('game')).toBe('abc-123')
    expect(url.searchParams.get('seat')).toBe('P2')
    expect(url.searchParams.get('code')).toBe('QW7RT2')
    expect(readRoomParams(url.search)).toEqual(params)
  })

  it('clears params that are null', () => {
    const start = applyRoomParams(new URL('http://localhost/'), {
      gameId: 'g',
      seat: 'P1',
      code: 'C',
    })
    const cleared = applyRoomParams(start, { gameId: 'g', seat: null, code: null })

    expect(cleared.searchParams.has('seat')).toBe(false)
    expect(cleared.searchParams.has('code')).toBe(false)
    expect(readRoomParams(cleared.search)).toEqual({ gameId: 'g', seat: null, code: null })
  })

  it('ignores a bogus seat value', () => {
    expect(readRoomParams('?game=g&seat=banana').seat).toBeNull()
  })

  it('reads an empty search as all-null', () => {
    expect(readRoomParams('')).toEqual({ gameId: null, seat: null, code: null })
  })
})
