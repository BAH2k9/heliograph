import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'

// Not yet in lib.dom.d.ts.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

const DISMISSED_KEY = 'heliograph.installPromptDismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private window / blocked storage — just re-offer every visit, not worth failing over.
    return false
  }
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * A light, dismissible "install this as an app" hint — Android/Chrome gets a real install
 * button via `beforeinstallprompt`; iOS Safari has no such API, so it gets a one-line
 * Share-menu pointer instead. Renders nothing once installed or dismissed.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Best effort — worst case it re-offers next visit.
    }
  }

  if (dismissed || isStandalone()) return null

  if (deferredPrompt) {
    return (
      <div className="mt-6 flex items-center justify-center gap-3 text-sm">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void deferredPrompt.prompt()
            setDeferredPrompt(null)
          }}
        >
          Install Heliograph
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="text-text-subtle hover:text-text-muted hover:underline"
        >
          not now
        </button>
      </div>
    )
  }

  if (isIosSafari()) {
    return (
      <p className="mt-6 text-sm text-text-subtle">
        On iPhone/iPad: tap Share, then "Add to Home Screen" to install Heliograph.{' '}
        <button type="button" onClick={dismiss} className="hover:text-text-muted hover:underline">
          dismiss
        </button>
      </p>
    )
  }

  return null
}
