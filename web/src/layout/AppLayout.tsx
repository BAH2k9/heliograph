import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BotGameDialog } from '../components/BotGameDialog'
import { BugReportDialog } from '../components/BugReportDialog'
import { MobileNav } from '../components/MobileNav'
import { NewGameDialog } from '../components/NewGameDialog'
import { PendingInvitesTray } from '../components/PendingInvitesTray'
import { PwaUpdatePrompt } from '../components/PwaUpdatePrompt'
import { Sidebar } from '../components/Sidebar'
import { SettingsDialog } from '../components/SettingsDialog'
import { WinOverlay } from '../components/WinOverlay'
import type { CreateBotGameOptions, NewGameOptions } from '../api/client'
import { Button } from '../ui/Button'
import { useAuth } from '../authStore'
import { seatedInLiveGame } from '../game/turnLock'
import { useGame } from '../store'

export interface PlayOutletContext {
  openSettings: () => void
  settingsOpen: boolean
  /** Opens `BugReportDialog` — the header trigger itself lives in `PlayScreen` (next to the
   *  settings gear it shares a row with), but the dialog's open/close state lives here beside
   *  `settingsOpen`, same pattern. See `plans/10-bug-traceability.md`. */
  openBugReport: () => void
}

/**
 * Cross-page chrome: the sidebar, the setup/settings dialogs, and the win overlay. Also the
 * app-wide login gate — this is the one layout element every route below it shares (see
 * `App.tsx`), so redirecting an unauthenticated visitor to `/login` here covers all of them at
 * once rather than wrapping each route individually. `/login` itself lives outside `AppLayout`.
 */
export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  const seat = useGame((s) => s.seat)
  const status = useGame((s) => s.status)
  const ruleset = useGame((s) => s.ruleset)
  const layout = useGame((s) => s.layout)
  const error = useGame((s) => s.error)
  const gameId = useGame((s) => s.gameId)
  const newGame = useGame((s) => s.newGame)
  const newBotGame = useGame((s) => s.newBotGame)
  const dismissError = useGame((s) => s.dismissError)
  const reconnectRealtime = useGame((s) => s.reconnectRealtime)

  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const hydrate = useAuth((s) => s.hydrate)

  // Multiplayer room creation now goes through PlayHubScreen's time-control-first flow at
  // /play/new (see onHostGame below) — this dialog is Local Play only.
  const [setup, setSetup] = useState<null | 'local'>(null)
  const [botSetupOpen, setBotSetupOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

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
    await newGame(opts)
    setSetup(null)
    if (!useGame.getState().error) navigate('/play')
  }

  async function confirmBotSetup(opts: CreateBotGameOptions) {
    await newBotGame(opts)
    setBotSetupOpen(false)
    if (!useGame.getState().error) navigate('/play')
  }

  // Every route under AppLayout requires a session now (guest play is gone) — bounce anywhere
  // else to /login. authStore's `persist` middleware rehydrates `user` from localStorage before
  // first paint, so this doesn't need a separate loading state.
  if (!user) return <Navigate to="/login" replace />

  // Block Local Play / Play Bot / Challenge a Friend only while an actual match is under way —
  // a lingering seat after the game has ended (the player hasn't clicked "Leave" yet) shouldn't
  // itself block starting a new one, same reasoning as `playAgain` leaving the room on the
  // player's behalf. See `seatedInLiveGame`.
  const seated = seatedInLiveGame(seat, status)

  const navActions = {
    onLocalPlay: () => setSetup('local'),
    onPlayBot: () => setBotSetupOpen(true),
    // Friend-invite is the primary multiplayer entry point (plans/07-friend-invites-matches.md);
    // the old time-control-first "create a room, get a code" flow stays reachable as the
    // secondary "play with a link" option.
    onHostGame: () => navigate('/play/invite'),
    onGameArchive: () => navigate('/archive'),
    onSettings: () => setSettingsOpen(true),
    onFriends: () => navigate('/friends'),
    onLeaderboard: () => navigate('/leaderboard'),
    onAdmin: () => navigate('/admin'),
    onProfile: () => navigate('/profile'),
    onLogout: logout,
  }

  return (
    <div
      // Left/right insets cover the landscape notch/home-indicator cutout in the installed
      // (standalone) PWA window — 0 on any device without one, so this is a no-op elsewhere.
      className="flex min-h-screen min-h-dvh pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <Sidebar
        className="hidden md:flex"
        variant={location.pathname === '/play' || location.pathname.startsWith('/replay/') ? 'icon' : 'full'}
        seated={seated}
        user={user}
        {...navActions}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav seated={seated} user={user} {...navActions} />

        {error && (
          <div className="flex items-center justify-between gap-4 bg-danger/15 px-4 py-2 text-sm text-danger">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={dismissError} className="shrink-0">
              dismiss
            </Button>
          </div>
        )}

        <Outlet
          context={
            {
              openSettings: () => setSettingsOpen(true),
              settingsOpen,
              openBugReport: () => setBugReportOpen(true),
            } satisfies PlayOutletContext
          }
        />
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} />
      <NewGameDialog
        key={`setup-${setup ?? 'closed'}`}
        open={setup !== null}
        actionLabel="Local Play"
        initialRuleset={ruleset}
        initialLayout={layout}
        onConfirm={(opts) => void confirmSetup(opts)}
        onClose={() => setSetup(null)}
      />
      <BotGameDialog
        key={`bot-${botSetupOpen ? 'open' : 'closed'}`}
        open={botSetupOpen}
        initialRuleset={ruleset}
        initialLayout={layout}
        onConfirm={(opts) => void confirmBotSetup(opts)}
        onClose={() => setBotSetupOpen(false)}
      />
      <WinOverlay key={gameId ?? 'none'} />
      <PendingInvitesTray />
      <PwaUpdatePrompt />
    </div>
  )
}
