import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../ui/Button'

/**
 * Registers the installable-app service worker and surfaces a dismissible "new version" toast
 * instead of reloading silently. A silent `autoUpdate` reload could land on a player mid-match —
 * see plans/05-pwa.md's owner decision — so this always waits for an explicit tap.
 *
 * Mounted once at the app-shell level (`layout/AppLayout.tsx`), route-independent.
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3 rounded-lg bg-surface-raised px-4 py-2.5 text-sm text-text shadow-xl ring-1 ring-border">
        <span>A new version of Khet is available.</span>
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          Reload
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
