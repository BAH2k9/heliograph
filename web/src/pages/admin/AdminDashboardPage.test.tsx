import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminDashboardPage } from './AdminDashboardPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const STATS = {
  totalUsers: 12,
  adminCount: 2,
  disabledCount: 1,
  gamesInProgress: 3,
  gamesFinished: 40,
  openRooms: 1,
  ratedGames: 22,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminDashboardPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminDashboardPage', () => {
  it('loads and shows the stat cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(STATS)))
    renderPage()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText('Games in progress')).toBeInTheDocument()
    expect(screen.getByText('Rated games')).toBeInTheDocument()
  })

  it('shows an error when stats fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'db down' }, 500)))
    renderPage()

    expect(await screen.findByText(/Couldn't load stats: db down/)).toBeInTheDocument()
  })

  it('runs a room cleanup and reports the count', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(STATS)) // initial getStats
      .mockResolvedValueOnce(jsonResponse({ deletedCount: 4 })) // cleanupRooms
      .mockResolvedValueOnce(jsonResponse(STATS)) // getStats refresh
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await screen.findByText('12')
    fireEvent.click(screen.getByRole('button', { name: 'Run cleanup' }))

    expect(await screen.findByText('Removed 4 stale rooms.')).toBeInTheDocument()
    const cleanupCall = fetchMock.mock.calls[1]
    expect(cleanupCall[0]).toContain('/api/admin/rooms/cleanup')
    expect(JSON.parse(cleanupCall[1].body)).toEqual({ olderThanHours: 24 })
  })
})
