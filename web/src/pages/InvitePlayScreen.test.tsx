import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvitePlayScreen } from './InvitePlayScreen'
import { useGame } from '../store'

const initialGameState = useGame.getState()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function mockFetch(handlers: {
  friends?: unknown[]
  onSendInvite?: (body: unknown) => Response
  sent?: unknown[]
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/friends' && method === 'GET') return Promise.resolve(jsonResponse(handlers.friends ?? []))
    if (url === '/api/invites/sent' && method === 'GET') return Promise.resolve(jsonResponse(handlers.sent ?? []))
    if (url === '/api/invites' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      return Promise.resolve(handlers.onSendInvite ? handlers.onSendInvite(body) : jsonResponse({ id: 'inv-1', expiresAtUtc: '2026-09-01T00:05:00Z' }, 201))
    }
    return Promise.resolve(jsonResponse({ error: `unhandled ${method} ${url}` }, 404))
  })
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/play/invite']}>
      <Routes>
        <Route path="/play/invite" element={<InvitePlayScreen />} />
        <Route path="/play" element={<p>play screen stub</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  useGame.setState(initialGameState, true)
  vi.unstubAllGlobals()
})

describe('InvitePlayScreen', () => {
  it('lists friends and requires picking one before sending', async () => {
    vi.stubGlobal('fetch', mockFetch({ friends: [{ userId: 'u2', displayName: 'Ana', discriminator: '0042', avatarId: null }] }))

    renderScreen()

    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeDisabled()
  })

  it('sends an invite with the chosen friend/ruleset/rated flag', async () => {
    const fetchMock = mockFetch({ friends: [{ userId: 'u2', displayName: 'Ana', discriminator: '0042', avatarId: null }] })
    vi.stubGlobal('fetch', fetchMock)

    renderScreen()
    fireEvent.click(await screen.findByText('Ana'))
    fireEvent.click(screen.getByLabelText('Rated'))
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/invites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ inviteeUserId: 'u2', ruleset: 'FixedSun', layout: 'Dawn', timeControl: undefined, rated: true }),
        }),
      ),
    )
    expect(await screen.findByText(/Invite sent/)).toBeInTheDocument()
  })

  // Regression: play-by-code is a removed feature, but this screen kept a "Play by code instead"
  // button pointing at its old `/play/new` page.
  it('offers no play-by-code fallback', async () => {
    vi.stubGlobal('fetch', mockFetch({ friends: [] }))
    renderScreen()

    expect(await screen.findByRole('button', { name: 'Send invite' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /code/i })).toBeNull()
    expect(screen.queryByText(/code/i)).toBeNull()
  })

  it('recovers a missed inviteAccepted push by polling GET /api/invites/sent', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ friends: [], sent: [{ id: 'inv-1', status: 'Accepted', room: { gameId: 'g1', code: 'ABCD', seat: 'P1' } }] }),
    )
    const enterRoom = vi.fn().mockResolvedValue(undefined)
    useGame.setState({ enterRoom })

    renderScreen()

    await waitFor(() => expect(enterRoom).toHaveBeenCalledWith({ gameId: 'g1', code: 'ABCD', seat: 'P1' }))
    expect(await screen.findByText('play screen stub')).toBeInTheDocument()
  })
})
