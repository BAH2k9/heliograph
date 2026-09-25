import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { HeroDemoBoard } from '../components/HeroDemoBoard'
import { InstallPrompt } from '../components/InstallPrompt'
import { Logo } from '../components/Logo'
import type { PlayOutletContext } from '../layout/AppLayout'
import { Button } from '../ui/Button'

/** The marketing-style home screen: an animated demo board, no game state, no network. */
export function LandingPage() {
  const [params] = useSearchParams()
  const { openPlayMenu } = useOutletContext<PlayOutletContext>()

  // Every room link ever shared points at the root path (there was no router before).
  // Keep those working by handing them straight to the play screen.
  if (params.get('game')) return <Navigate to={`/play?${params.toString()}`} replace />

  return (
    <div className="flex-1 bg-surface">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <Logo withWordmark size="lg" />
        <p className="mt-4 max-w-md text-balance leading-relaxed text-text-muted">
          A board game of sunlight and mirrors. Move your pieces, angle your mirrors, and flash
          the beam into the enemy Keep.
        </p>

        {/* Phones only: the desktop rail already lists the ways to play right beside this. Kept
            above the demo board so it's on screen without scrolling. */}
        <Button className="mt-8 w-full max-w-xs md:hidden" onClick={openPlayMenu}>
          Play
        </Button>

        <div className="mt-12 w-full">
          <HeroDemoBoard />
        </div>

        <p className="mt-8 hidden text-sm text-text-subtle md:block">
          Pick Local Play or Challenge a Friend to get started.
        </p>

        <InstallPrompt />
      </div>
    </div>
  )
}
