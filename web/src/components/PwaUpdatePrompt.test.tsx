import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'

const setNeedRefresh = vi.fn()
const updateServiceWorker = vi.fn()
let needRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}))

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    needRefresh = false
    setNeedRefresh.mockClear()
    updateServiceWorker.mockClear()
  })

  it('renders nothing while no update is pending', () => {
    render(<PwaUpdatePrompt />)
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument()
  })

  it('shows a reload toast once an update is available, and reloads on tap', () => {
    needRefresh = true
    render(<PwaUpdatePrompt />)

    expect(screen.getByText(/new version of khet is available/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('dismisses without reloading', () => {
    needRefresh = true
    render(<PwaUpdatePrompt />)

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(setNeedRefresh).toHaveBeenCalledWith(false)
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })
})
