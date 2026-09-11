import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin } from './components/RequireAdmin'
import { AppLayout } from './layout/AppLayout'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminGamesPage } from './pages/admin/AdminGamesPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { FriendsPage } from './pages/FriendsPage'
import { GameArchivePage } from './pages/GameArchivePage'
import { InvitePlayScreen } from './pages/InvitePlayScreen'
import { KitchenSink } from './pages/KitchenSink'
import { LandingPage } from './pages/LandingPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LoginPage } from './pages/LoginPage'
import { PlayHubScreen } from './pages/PlayHubScreen'
import { PlayScreen } from './pages/PlayScreen'
import { ProfilePage } from './pages/ProfilePage'
import { ReplayScreen } from './pages/ReplayScreen'

export default function App() {
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/kitchen-sink" element={<KitchenSink />} />}
      {/* Outside AppLayout: reachable without a session, and AppLayout itself is what redirects
          every other route here when there's no `user` (see its doc comment). */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/play/new" element={<PlayHubScreen />} />
        <Route path="/play/invite" element={<InvitePlayScreen />} />
        <Route path="/archive" element={<GameArchivePage />} />
        <Route path="/replay/:gameId" element={<ReplayScreen />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/games"
          element={
            <RequireAdmin>
              <AdminGamesPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
