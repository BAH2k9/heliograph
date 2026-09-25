import { useEffect, useRef } from 'react'

/**
 * Calls `onForeground` whenever the page becomes visible again or the network comes back. That
 * covers a phone being unlocked, the installed app being switched back to, a desktop tab being
 * refocused after a while, and wifi/cellular reconnecting. `online` is ignored while the page is
 * hidden; the later `visibilitychange` covers that case.
 *
 * The latest `onForeground` is read through a ref, so a caller passing an inline function doesn't
 * re-subscribe the listeners on every render.
 */
export function useOnForeground(onForeground: () => void): void {
  const latest = useRef(onForeground)
  useEffect(() => {
    latest.current = onForeground
  })

  useEffect(() => {
    function handle() {
      if (document.visibilityState === 'visible') latest.current()
    }
    document.addEventListener('visibilitychange', handle)
    window.addEventListener('online', handle)
    return () => {
      document.removeEventListener('visibilitychange', handle)
      window.removeEventListener('online', handle)
    }
  }, [])
}
