import { useEffect, useState } from 'react'

const ROWS = 8
const COLS = 10

function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'unreachable'>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setApiStatus(data.status === 'ok' ? 'ok' : 'unreachable'))
      .catch(() => setApiStatus('unreachable'))
  }, [])

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="mb-1 text-2xl font-semibold">Khet</h1>
      <p className="mb-4 text-sm text-gray-500">
        API status: <span data-testid="api-status">{apiStatus}</span>
      </p>
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
