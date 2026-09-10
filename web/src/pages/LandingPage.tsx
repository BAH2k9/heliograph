import { Navigate, useSearchParams } from 'react-router-dom'
import { HeroDemoBoard } from '../components/HeroDemoBoard'
import { Logo } from '../components/Logo'

/** The marketing-style home screen: an animated demo board, no game state, no network. */
export function LandingPage() {
  const [params] = useSearchParams()

  // Every room link ever shared points at the root path (there was no router before).
  // Keep those working by handing them straight to the play screen.
  if (params.get('game')) return <Navigate to={`/play?${params.toString()}`} replace />

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 20%, rgba(126,20,255,0.18), transparent 55%), radial-gradient(circle at 80% 75%, rgba(71,191,255,0.14), transparent 55%)',
        }}
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center">
        <Logo withWordmark size="lg" />
        <p className="mt-4 max-w-xl text-text-muted">
          A laser-and-mirrors board game of ancient strategy. Move your pieces, fire your beam,
          and strike down the enemy Pharaoh.
        </p>

        <div className="mt-10 w-full">
          <HeroDemoBoard />
        </div>

        <p className="mt-8 text-sm text-text-subtle">
          Pick Local Play, Host Game, or Join Game from the left to get started.
        </p>
      </div>
    </div>
  )
}
