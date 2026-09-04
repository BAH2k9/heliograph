import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { GameArchivePage } from './pages/GameArchivePage'
import { LandingPage } from './pages/LandingPage'
import { PlayScreen } from './pages/PlayScreen'
import { ReplayScreen } from './pages/ReplayScreen'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/archive" element={<GameArchivePage />} />
        <Route path="/replay/:gameId" element={<ReplayScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
