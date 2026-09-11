import { Navigate, useSearchParams } from 'react-router-dom'
import { HeroDemoBoard } from '../components/HeroDemoBoard'
import { InstallPrompt } from '../components/InstallPrompt'
import { Logo } from '../components/Logo'

/** The marketing-style home screen: an animated demo board, no game state, no network. */
export function LandingPage() {
  const [params] = useSearchParams()

  // Every room link ever shared points at the root path (there was no router before).
  // Keep those working by handing them straight to the play screen.
  if (params.get('game')) return <Navigate to={`/play?${params.toString()}`} replace />

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
        <Logo withWordmark size="lg" />
        <p className="mt-4 max-w-md text-balance leading-relaxed text-text-muted">
          A laser-and-mirrors board game of ancient strategy. Move your pieces, fire your beam,
          and strike down the enemy Pharaoh.
        </p>

        <div className="mt-12 w-full">
          <HeroDemoBoard />
        </div>

        <p className="mt-8 text-sm text-text-subtle">
          Pick Local Play, Host Game, or Join Game to get started.
        </p>

        <InstallPrompt />
      </div>
    </div>
  )
}
