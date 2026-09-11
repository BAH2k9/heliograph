import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from './InstallPrompt'

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function setStandalone(standalone: boolean) {
  Object.defineProperty(window.navigator, 'standalone', { value: standalone, configurable: true })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36'
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    setStandalone(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when already installed (standalone)', () => {
    setUserAgent(ANDROID_CHROME_UA)
    setStandalone(true)
    render(<InstallPrompt />)
    expect(screen.queryByText(/install khet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument()
  })

  it('shows an Install button once beforeinstallprompt fires, and prompts on click', () => {
    setUserAgent(ANDROID_CHROME_UA)
    render(<InstallPrompt />)
    expect(screen.queryByText(/install khet/i)).not.toBeInTheDocument()

    const prompt = vi.fn().mockResolvedValue(undefined)
    fireEvent(
      window,
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }),
    )

    const button = screen.getByRole('button', { name: /install khet/i })
    fireEvent.click(button)
    expect(prompt).toHaveBeenCalled()
  })

  it('shows the Share-menu hint on iOS Safari with no install API', () => {
    setUserAgent(IOS_SAFARI_UA)
    render(<InstallPrompt />)
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument()
  })

  it('dismissing persists across remounts', () => {
    setUserAgent(IOS_SAFARI_UA)
    const { unmount } = render(<InstallPrompt />)
    fireEvent.click(screen.getByText(/dismiss/i))
    unmount()

    render(<InstallPrompt />)
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument()
  })
})
