import { useEffect, useState } from 'react'

const ROWS = 8
const COLS = 10

type GameSession = {
  id: string
  createdAtUtc: string
}

function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'unreachable'>('checking')
  const [lastSession, setLastSession] = useState<GameSession | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setApiStatus(data.status === 'ok' ? 'ok' : 'unreachable'))
      .catch(() => setApiStatus('unreachable'))
  }, [])

  const createGameSession = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/gamesessions', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      setLastSession(await res.json())
    } catch {
      setLastSession(null)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="mb-1 text-2xl font-semibold">Khet</h1>
      <p className="mb-4 text-sm text-gray-500">
        API status: <span data-testid="api-status">{apiStatus}</span>
      </p>
      <button
        type="button"
        onClick={createGameSession}
        disabled={creating}
        className="mb-4 rounded bg-gray-800 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create test game session'}
      </button>
      {lastSession && (
        <p className="mb-4 text-sm text-gray-500">
          Created <code>{lastSession.id}</code> at {lastSession.createdAtUtc}
        </p>
      )}
      <div
        className="grid w-fit gap-px bg-gray-300"
        style={{ gridTemplateColumns: `repeat(${COLS}, 2.5rem)` }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => (
          <div key={i} className="flex h-10 w-10 items-center justify-center bg-white" />
        ))}
      </div>
    </div>
  )
}

export default App
