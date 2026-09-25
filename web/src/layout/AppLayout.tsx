import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ActiveGameBanner } from '../components/ActiveGameBanner'
import { BotGameDialog } from '../components/BotGameDialog'
import { BugReportDialog } from '../components/BugReportDialog'
import { GameClockProvider } from '../components/GameClockContext'
import { Footer } from './Footer'
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
import { hasActiveGame } from '../game/turnLock'
import { useGame } from '../store'

export interface PlayOutletContext {
  openSettings: () => void
  settingsOpen: boolean
  /** Opens `BugReportDialog` — the header trigger itself lives in `PlayScreen` (next to the
   *  settings gear it shares a row with), but the dialog's open/close state lives here beside
   *  `settingsOpen`, same pattern. See `backlog/10-bug-traceability.md`. */
  openBugReport: () => void
  /** Opens the phone's `PlaySheet` (Local Play / Play Bot / Challenge a Friend). The landing
   *  page's Play button calls it; the Play tab in `MobileTabBar` opens the same sheet. */
  openPlayMenu: () => void
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
  const recoverActiveGame = useGame((s) => s.recoverActiveGame)

  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const hydrate = useAuth((s) => s.hydrate)

  // Multiplayer room creation now goes through PlayHubScreen's time-control-first flow at
  // /play/new (see onHostGame below) — this dialog is Local Play only.
  const [setup, setSetup] = useState<null | 'local'>(null)
  const [botSetupOpen, setBotSetupOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [playMenuOpen, setPlayMenuOpen] = useState(false)

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

  // Boot-time recovery for the active-game banner (and the nav-block below): `useGame` is a plain
  // in-memory store with no `persist()`, so a hard refresh or a fresh tab on any page other than
  // `/play` starts with `gameId: null` even though the game itself is still `InProgress`
  // server-side — `PlayScreen`'s own URL-params resume only runs when `/play` is actually
  // mounted. Fires once per login (guarded on `user?.id`, not just mount, so a login after a
  // logout re-checks); a no-op once a game is already loaded or there isn't an active one.
  useEffect(() => {
    if (!user?.id) return
    void recoverActiveGame()
  }, [user?.id, recoverActiveGame])

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

  // Block Local Play / Play Bot / Challenge a Friend while any game — room, local, or bot — is
  // still under way. Resignation is now the only way to end a game early (no more "Leave"), so
  // this has to cover local/bot games too, not just a seated room game. See `hasActiveGame`.
  const seated = hasActiveGame(gameId, status, seat)

  const navActions = {
    onLocalPlay: () => setSetup('local'),
    onPlayBot: () => setBotSetupOpen(true),
    // Friend-invite is the primary multiplayer entry point (backlog/07-friend-invites-matches.md);
    // the old time-control-first "create a room, get a code" flow stays reachable as the
    // secondary "play with a link" option.
    onHostGame: () => navigate('/play/invite'),
    onGameArchive: () => navigate('/archive'),
    onSettings: () => setSettingsOpen(true),
    onFriends: () => navigate('/friends'),
    onLeaderboard: () => navigate('/leaderboard'),
    // A full page load, not navigate(): over the public hostname, Cloudflare Access guards
    // `/admin*` and `/api/admin/*`, and it can only run its sign-in on a real browser navigation.
    // A client-side hop would skip it, and the admin page's fetches would then hit Access's
    // redirect with no session. On the LAN there's no Access, so this is just a reload.
    onAdmin: () => window.location.assign('/admin'),
    onProfile: () => navigate('/profile'),
    onLogout: logout,
  }

  return (
    <GameClockProvider>
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

        <div
          // Below md, MobileTabBar is fixed over the bottom of the screen, so the column reserves
          // its height (h-16 plus the home-indicator inset) so page content never ends under it.
          className="flex min-w-0 flex-1 flex-col bg-surface pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          <MobileNav
            seated={seated}
            user={user}
            pathname={location.pathname}
            playMenuOpen={playMenuOpen}
            onPlayMenuChange={setPlayMenuOpen}
            onReturnToGame={() => navigate('/play')}
            {...navActions}
          />

          {error && (
            <div className="flex items-center justify-between gap-4 bg-danger/15 px-4 py-2 text-sm text-danger">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={dismissError} className="shrink-0">
                dismiss
              </Button>
            </div>
          )}

          <ActiveGameBanner />

          <Outlet
            context={
              {
                openSettings: () => setSettingsOpen(true),
                settingsOpen,
                openBugReport: () => setBugReportOpen(true),
                openPlayMenu: () => setPlayMenuOpen(true),
              } satisfies PlayOutletContext
            }
          />

          <Footer />
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
    </GameClockProvider>
  )
}
