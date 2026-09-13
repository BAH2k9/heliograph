import { afterEach, describe, expect, it } from 'vitest'
import { RING_SIZE, getRingBuffer, pushRingEntry, resetRingBuffer } from './diagnostics'

afterEach(() => resetRingBuffer())

describe('diagnostics ring buffer', () => {
  it('starts empty', () => {
    expect(getRingBuffer()).toEqual([])
  })

  it('records pushed entries in order', () => {
    pushRingEntry({ kind: 'action', label: 'first' })
    pushRingEntry({ kind: 'hub', label: 'second' })

    const buf = getRingBuffer()
    expect(buf).toHaveLength(2)
    expect(buf[0].label).toBe('first')
    expect(buf[1].label).toBe('second')
    expect(typeof buf[0].timestamp).toBe('number')
  })

  it('evicts the oldest entry once RING_SIZE is exceeded', () => {
    for (let i = 0; i < RING_SIZE + 5; i++) {
      pushRingEntry({ kind: 'rest', label: `entry-${i}` })
    }

    const buf = getRingBuffer()
    expect(buf).toHaveLength(RING_SIZE)
    expect(buf[0].label).toBe('entry-5')
    expect(buf[buf.length - 1].label).toBe(`entry-${RING_SIZE + 4}`)
  })

  it('getRingBuffer returns a copy, not the live array', () => {
    pushRingEntry({ kind: 'action', label: 'a' })
    const buf = getRingBuffer()
    buf.push({ kind: 'action', label: 'mutated', timestamp: Date.now() })

    expect(getRingBuffer()).toHaveLength(1)
  })

  it('resetRingBuffer clears everything', () => {
    pushRingEntry({ kind: 'action', label: 'a' })
    resetRingBuffer()
    expect(getRingBuffer()).toEqual([])
  })
})
