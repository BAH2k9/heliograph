import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { AppLayout } from './layout/AppLayout'
import { GameArchivePage } from './pages/GameArchivePage'
import { KitchenSink } from './pages/KitchenSink'
import { LandingPage } from './pages/LandingPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { PlayHubScreen } from './pages/PlayHubScreen'
import { PlayScreen } from './pages/PlayScreen'
import { ProfilePage } from './pages/ProfilePage'
import { ReplayScreen } from './pages/ReplayScreen'

export default function App() {
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/kitchen-sink" element={<KitchenSink />} />}
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/play/new" element={<PlayHubScreen />} />
        <Route path="/archive" element={<GameArchivePage />} />
        <Route path="/replay/:gameId" element={<ReplayScreen />} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <RequireAuth>
              <LeaderboardPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
