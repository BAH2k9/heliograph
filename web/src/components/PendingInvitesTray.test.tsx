import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PendingInvitesTray } from './PendingInvitesTray'
import { useAuth } from '../authStore'
import { useInvites } from '../inviteStore'
import { useGame } from '../store'

const initialAuthState = useAuth.getState()
const initialGameState = useGame.getState()

let inviteReceivedHandler: (() => void) | null = null

vi.mock('../realtime', () => ({
  subscribeToUserInvites: vi.fn((handler: (() => void) | null) => {
    inviteReceivedHandler = handler
    return Promise.resolve()
  }),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const invite = {
  id: 'inv-1',
  inviterId: 'u2',
  inviterDisplayName: 'Ana',
  inviterDiscriminator: '0042',
  inviterAvatarId: null,
  ruleset: 'Classic',
  layout: 'Classic',
  timeControl: '5+3',
  rated: true,
  createdAtUtc: '2026-09-01T00:00:00Z',
  expiresAtUtc: '2026-09-01T00:05:00Z',
}

function mockFetch(handlers: {
  pending?: unknown[]
  onAccept?: (id: string) => Response
  onDecline?: (id: string) => Response
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/invites/pending') return Promise.resolve(jsonResponse(handlers.pending ?? []))
    if (method === 'POST' && /\/api\/invites\/[^/]+\/accept$/.test(url)) {
      const id = url.match(/\/invites\/([^/]+)\/accept$/)?.[1] ?? ''
      return Promise.resolve(handlers.onAccept ? handlers.onAccept(id) : jsonResponse({ gameId: 'g1', code: 'ABCD', seat: 'P1' }))
    }
    if (method === 'POST' && /\/api\/invites\/[^/]+\/decline$/.test(url)) {
      const id = url.match(/\/invites\/([^/]+)\/decline$/)?.[1] ?? ''
      return Promise.resolve(handlers.onDecline ? handlers.onDecline(id) : new Response(null, { status: 204 }))
    }
    return Promise.resolve(jsonResponse({ error: `unhandled ${method} ${url}` }, 404))
  })
}

function renderTray() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<PendingInvitesTray />} />
        <Route path="/play" element={<p>play screen stub</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  useAuth.setState(initialAuthState, true)
  useGame.setState(initialGameState, true)
  useInvites.getState().reset()
  vi.unstubAllGlobals()
  inviteReceivedHandler = null
})

describe('PendingInvitesTray', () => {
  it('renders nothing for a guest', () => {
    vi.stubGlobal('fetch', mockFetch({}))
    const { container } = renderTray()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a badge count once invites load for a logged-in user', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    vi.stubGlobal('fetch', mockFetch({ pending: [invite] }))

    renderTray()

    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('refetches pending invites when the realtime handler fires', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    const fetchMock = mockFetch({ pending: [] })
    vi.stubGlobal('fetch', fetchMock)

    renderTray()
    await waitFor(() => expect(inviteReceivedHandler).not.toBeNull())

    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse([invite])))
    // subsequent calls after the refetch should see the invite too
    vi.stubGlobal(
      'fetch',
      mockFetch({ pending: [invite] }),
    )
    inviteReceivedHandler?.()

    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('accepting an invite enters the room and navigates to /play', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    vi.stubGlobal('fetch', mockFetch({ pending: [invite] }))
    const enterRoom = vi.fn().mockResolvedValue(undefined)
    useGame.setState({ enterRoom })

    renderTray()
    fireEvent.click(await screen.findByLabelText('Pending invites'))
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }))

    await waitFor(() => expect(enterRoom).toHaveBeenCalledWith({ gameId: 'g1', code: 'ABCD', seat: 'P1' }))
    expect(await screen.findByText('play screen stub')).toBeInTheDocument()
  })

  it('declining an invite removes it from the list', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    const fetchMock = mockFetch({ pending: [invite] })
    vi.stubGlobal('fetch', fetchMock)

    renderTray()
    fireEvent.click(await screen.findByLabelText('Pending invites'))
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/invites/inv-1/decline', expect.objectContaining({ method: 'POST' })),
    )
    await waitFor(() => expect(screen.queryByText('Ana')).toBeNull())
  })
})
