import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvitePlayScreen } from './InvitePlayScreen'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function mockFetch(handlers: { friends?: unknown[]; onSendInvite?: (body: unknown) => Response }) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/friends' && method === 'GET') return Promise.resolve(jsonResponse(handlers.friends ?? []))
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
        <Route path="/play/new" element={<p>play hub stub</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
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
          body: JSON.stringify({ inviteeUserId: 'u2', ruleset: 'Classic', layout: 'Classic', timeControl: undefined, rated: true }),
        }),
      ),
    )
    expect(await screen.findByText(/Invite sent/)).toBeInTheDocument()
  })

  it('links back to the code-based flow as a secondary option', async () => {
    vi.stubGlobal('fetch', mockFetch({ friends: [] }))
    renderScreen()

    fireEvent.click(await screen.findByRole('button', { name: 'Play by code instead' }))
    expect(await screen.findByText('play hub stub')).toBeInTheDocument()
  })
})
