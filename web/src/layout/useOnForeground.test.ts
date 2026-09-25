import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOnForeground } from './useOnForeground'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

afterEach(() => {
  setVisibility('visible')
})

describe('useOnForeground', () => {
  it('fires when the page becomes visible again', () => {
    const onForeground = vi.fn()
    renderHook(() => useOnForeground(onForeground))

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(onForeground).toHaveBeenCalledOnce()
  })

  it('does not fire when the page is being hidden', () => {
    const onForeground = vi.fn()
    renderHook(() => useOnForeground(onForeground))

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(onForeground).not.toHaveBeenCalled()
  })

  it('fires when the network comes back while visible, but not while hidden', () => {
    const onForeground = vi.fn()
    renderHook(() => useOnForeground(onForeground))

    setVisibility('hidden')
    window.dispatchEvent(new Event('online'))
    expect(onForeground).not.toHaveBeenCalled()

    setVisibility('visible')
    window.dispatchEvent(new Event('online'))
    expect(onForeground).toHaveBeenCalledOnce()
  })

  it('calls the latest callback without re-subscribing, and stops after unmount', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(({ cb }) => useOnForeground(cb), { initialProps: { cb: first } })

    rerender({ cb: second })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()

    unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(second).toHaveBeenCalledOnce()
  })
})
