import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { JoinGameDialog } from '../components/JoinGameDialog'
import { NewGameDialog } from '../components/NewGameDialog'
import { Sidebar } from '../components/Sidebar'
import { SettingsDialog } from '../components/SettingsDialog'
import { WinOverlay } from '../components/WinOverlay'
import type { NewGameOptions } from '../api/client'
import { useGame } from '../store'

export interface PlayOutletContext {
  openSettings: () => void
  settingsOpen: boolean
}

/** Cross-page chrome: the sidebar, the setup/join/settings dialogs, and the win overlay. */
export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  const seat = useGame((s) => s.seat)
  const ruleset = useGame((s) => s.ruleset)
  const layout = useGame((s) => s.layout)
  const busy = useGame((s) => s.busy)
  const error = useGame((s) => s.error)
  const gameId = useGame((s) => s.gameId)
  const newGame = useGame((s) => s.newGame)
  const createRoom = useGame((s) => s.createRoom)
  const joinRoom = useGame((s) => s.joinRoom)
  const dismissError = useGame((s) => s.dismissError)

  const [setup, setSetup] = useState<null | 'local' | 'host'>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function confirmSetup(opts: NewGameOptions) {
    if (setup === 'host') await createRoom(opts)
    else await newGame(opts)
    setSetup(null)
    if (!useGame.getState().error) navigate('/play')
  }

  async function confirmJoin(code: string) {
    await joinRoom(code)
    setJoinOpen(false)
    if (!useGame.getState().error) navigate('/play')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        variant={location.pathname === '/play' || location.pathname.startsWith('/replay/') ? 'icon' : 'full'}
        seated={seat !== null}
        onLocalPlay={() => setSetup('local')}
        onHostGame={() => setSetup('host')}
        onJoinGame={() => setJoinOpen(true)}
        onGameArchive={() => navigate('/archive')}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1">
        {error && (
          <div className="flex items-center justify-between bg-rose-900/60 px-4 py-2 text-sm text-rose-100">
            <span>{error}</span>
            <button type="button" onClick={dismissError} className="ml-4 underline">
              dismiss
            </button>
          </div>
        )}

        <Outlet context={{ openSettings: () => setSettingsOpen(true), settingsOpen } satisfies PlayOutletContext} />
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewGameDialog
        key={`setup-${setup ?? 'closed'}`}
        open={setup !== null}
        actionLabel={setup === 'host' ? 'Host Game' : 'Local Play'}
        initialRuleset={ruleset}
        initialLayout={layout}
        onConfirm={(opts) => void confirmSetup(opts)}
        onClose={() => setSetup(null)}
      />
      <JoinGameDialog
        key={`join-${joinOpen ? 'open' : 'closed'}`}
        open={joinOpen}
        busy={busy}
        onConfirm={(code) => void confirmJoin(code)}
        onClose={() => setJoinOpen(false)}
      />
      <WinOverlay key={gameId ?? 'none'} />
    </div>
  )
}
