import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PendingInvitesTray } from './PendingInvitesTray'
import { useAuth } from '../authStore'
import { useInvites } from '../inviteStore'
import { useFriendRequests } from '../friendRequestStore'
import { useGame } from '../store'
import type { RoomResponse } from '../api/types'

const initialAuthState = useAuth.getState()
const initialGameState = useGame.getState()

let inviteReceivedHandler: (() => void) | null = null
let friendRequestReceivedHandler: (() => void) | null = null
let inviteAcceptedHandler: ((room: RoomResponse) => void) | null = null

vi.mock('../realtime', () => ({
  subscribeToUserInvites: vi.fn((handler: (() => void) | null) => {
    inviteReceivedHandler = handler
    return Promise.resolve()
  }),
  subscribeToFriendRequests: vi.fn((handler: (() => void) | null) => {
    friendRequestReceivedHandler = handler
    return Promise.resolve()
  }),
  subscribeToInviteAccepted: vi.fn((handler: ((room: RoomResponse) => void) | null) => {
    inviteAcceptedHandler = handler
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
  incomingRequests?: unknown[]
  onAccept?: (id: string) => Response
  onDecline?: (id: string) => Response
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/invites/pending') return Promise.resolve(jsonResponse(handlers.pending ?? []))
    if (url === '/api/friends/requests/incoming') return Promise.resolve(jsonResponse(handlers.incomingRequests ?? []))
    if (method === 'POST' && /\/api\/invites\/[^/]+\/accept$/.test(url)) {
      const id = url.match(/\/invites\/([^/]+)\/accept$/)?.[1] ?? ''
      return Promise.resolve(handlers.onAccept ? handlers.onAccept(id) : jsonResponse({ gameId: 'g1', code: 'ABCD', seat: 'P1' }))
    }
    if (method === 'POST' && /\/api\/invites\/[^/]+\/decline$/.test(url)) {
      const id = url.match(/\/invites\/([^/]+)\/decline$/)?.[1] ?? ''
      return Promise.resolve(handlers.onDecline ? handlers.onDecline(id) : new Response(null, { status: 204 }))
    }
    if (method === 'POST' && /\/api\/friends\/requests\/[^/]+\/accept$/.test(url)) {
      return Promise.resolve(jsonResponse({ userId: 'u2', displayName: 'Ana', discriminator: '0042', avatarId: null }))
    }
    if (method === 'POST' && /\/api\/friends\/requests\/[^/]+\/decline$/.test(url)) {
      return Promise.resolve(new Response(null, { status: 204 }))
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
  useFriendRequests.getState().reset()
  vi.unstubAllGlobals()
  inviteReceivedHandler = null
  friendRequestReceivedHandler = null
  inviteAcceptedHandler = null
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
    fireEvent.click(await screen.findByLabelText('Notifications'))
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }))

    await waitFor(() => expect(enterRoom).toHaveBeenCalledWith({ gameId: 'g1', code: 'ABCD', seat: 'P1' }))
    expect(await screen.findByText('play screen stub')).toBeInTheDocument()
  })

  it('declining an invite removes it from the list', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    const fetchMock = mockFetch({ pending: [invite] })
    vi.stubGlobal('fetch', fetchMock)

    renderTray()
    fireEvent.click(await screen.findByLabelText('Notifications'))
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/invites/inv-1/decline', expect.objectContaining({ method: 'POST' })),
    )
    await waitFor(() => expect(screen.queryByText('Ana')).toBeNull())
  })

  const friendRequest = {
    requestId: 'req-1',
    userId: 'u3',
    displayName: 'Bo',
    discriminator: '0099',
    avatarId: null,
    createdAtUtc: '2026-09-01T00:00:00Z',
  }

  it('shows a badge count once an incoming friend request loads', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    vi.stubGlobal('fetch', mockFetch({ incomingRequests: [friendRequest] }))

    renderTray()

    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('accepting a friend request removes it from the list', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    const fetchMock = mockFetch({ incomingRequests: [friendRequest] })
    vi.stubGlobal('fetch', fetchMock)

    renderTray()
    fireEvent.click(await screen.findByLabelText('Notifications'))
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/friends/requests/req-1/accept', expect.objectContaining({ method: 'POST' })),
    )
    await waitFor(() => expect(screen.queryByText('Bo')).toBeNull())
  })

  it('refetches incoming friend requests when the realtime handler fires', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    vi.stubGlobal('fetch', mockFetch({ incomingRequests: [] }))

    renderTray()
    await waitFor(() => expect(friendRequestReceivedHandler).not.toBeNull())

    vi.stubGlobal('fetch', mockFetch({ incomingRequests: [friendRequest] }))
    friendRequestReceivedHandler?.()

    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('an inviteAccepted push (the inviter side) enters the room and navigates to /play', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'a@b.com', displayName: 'A', ratings: [] } })
    vi.stubGlobal('fetch', mockFetch({}))
    const enterRoom = vi.fn().mockResolvedValue(undefined)
    useGame.setState({ enterRoom })

    renderTray()
    await waitFor(() => expect(inviteAcceptedHandler).not.toBeNull())

    inviteAcceptedHandler?.({ gameId: 'g2', code: 'WXYZ', seat: 'P1' })

    await waitFor(() => expect(enterRoom).toHaveBeenCalledWith({ gameId: 'g2', code: 'WXYZ', seat: 'P1' }))
    expect(await screen.findByText('play screen stub')).toBeInTheDocument()
  })
})
