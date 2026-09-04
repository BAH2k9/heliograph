import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AuthDialog } from '../components/AuthDialog'
import { JoinGameDialog } from '../components/JoinGameDialog'
import { NewGameDialog } from '../components/NewGameDialog'
import { Sidebar } from '../components/Sidebar'
import { SettingsDialog } from '../components/SettingsDialog'
import { WinOverlay } from '../components/WinOverlay'
import type { NewGameOptions } from '../api/client'
import { useAuth } from '../authStore'
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
  const reconnectRealtime = useGame((s) => s.reconnectRealtime)

  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const hydrate = useAuth((s) => s.hydrate)

  const [setup, setSetup] = useState<null | 'local' | 'host'>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authMode, setAuthMode] = useState<null | 'login' | 'register'>(null)

  // Silently renew the access token on app boot rather than waiting for the first 401.
  // `hydrate` is a stable zustand action reference, so this still only runs once.
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // A login or logout mid-game needs a fresh hub connection for accessTokenFactory to pick up
  // the new token — the existing connection captured the old one (or none) at connect time.
  // Guarded to fire only on an actual identity change, not on mount: the boot-time `hydrate()`
  // above can resolve shortly after mount and would otherwise tear down a hub connection that
  // just started following a game.
  const lastUserId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const previous = lastUserId.current
    const current = user?.id ?? null
    lastUserId.current = current
    if (previous === undefined || previous === current) return
    reconnectRealtime()
  }, [user?.id, reconnectRealtime])

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
        user={user}
        onLocalPlay={() => setSetup('local')}
        onHostGame={() => setSetup('host')}
        onJoinGame={() => setJoinOpen(true)}
        onGameArchive={() => navigate('/archive')}
        onSettings={() => setSettingsOpen(true)}
        onLeaderboard={() => navigate('/leaderboard')}
        onProfile={() => navigate('/profile')}
        onLogin={() => setAuthMode('login')}
        onRegister={() => setAuthMode('register')}
        onLogout={logout}
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
      <AuthDialog
        key={`auth-${authMode ?? 'closed'}`}
        open={authMode !== null}
        initialMode={authMode ?? 'login'}
        onClose={() => setAuthMode(null)}
      />
    </div>
  )
}
