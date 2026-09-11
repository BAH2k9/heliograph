import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FriendsPage } from './FriendsPage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Routes each mocked call by URL/method, same shape as `ProfilePage.test.tsx`'s `fetchMock`. */
function mockFetch(handlers: {
  friends?: unknown[]
  incoming?: unknown[]
  outgoing?: unknown[]
  search?: (q: string) => unknown[]
  onSendRequest?: (userId: string) => Response
  onAccept?: (requestId: string) => Response
  onDecline?: (requestId: string) => Response
  onRemove?: (userId: string) => Response
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'

    if (url.startsWith('/api/friends/requests/incoming')) return Promise.resolve(jsonResponse(handlers.incoming ?? []))
    if (url.startsWith('/api/friends/requests/outgoing')) return Promise.resolve(jsonResponse(handlers.outgoing ?? []))
    if (method === 'POST' && /\/api\/friends\/requests\/[^/]+\/accept$/.test(url)) {
      const id = url.match(/\/requests\/([^/]+)\/accept$/)?.[1] ?? ''
      return Promise.resolve(handlers.onAccept ? handlers.onAccept(id) : jsonResponse({}))
    }
    if (method === 'POST' && /\/api\/friends\/requests\/[^/]+\/decline$/.test(url)) {
      const id = url.match(/\/requests\/([^/]+)\/decline$/)?.[1] ?? ''
      return Promise.resolve(handlers.onDecline ? handlers.onDecline(id) : new Response(null, { status: 204 }))
    }
    if (method === 'POST' && url === '/api/friends/requests') {
      const body = init?.body ? (JSON.parse(init.body as string) as { addresseeId: string }) : { addresseeId: '' }
      return Promise.resolve(handlers.onSendRequest ? handlers.onSendRequest(body.addresseeId) : jsonResponse({ status: 'pending' }, 201))
    }
    if (url === '/api/friends' && method === 'GET') return Promise.resolve(jsonResponse(handlers.friends ?? []))
    if (method === 'DELETE' && /\/api\/friends\/[^/]+$/.test(url)) {
      const id = url.match(/\/friends\/([^/]+)$/)?.[1] ?? ''
      return Promise.resolve(handlers.onRemove ? handlers.onRemove(id) : new Response(null, { status: 204 }))
    }
    if (url.startsWith('/api/users/search')) {
      const q = new URL(url, 'http://x').searchParams.get('q') ?? ''
      return Promise.resolve(jsonResponse(handlers.search ? handlers.search(q) : []))
    }
    return Promise.resolve(jsonResponse({ error: `unhandled ${method} ${url}` }, 404))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Real timers throughout — the search debounce (300ms) is well inside `findBy*`'s default
// 1000ms poll window, and fake timers don't mix cleanly with Testing Library's own internal
// polling (see `ResignButton.test.tsx`'s isolated `vi.useFakeTimers()` for the one place that
// combination is worth the ceremony).
function typeQuery(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

describe('FriendsPage', () => {
  it('searches and renders results with the discriminator', async () => {
    const fetchMock = mockFetch({
      search: (q) => (q === 'ana' ? [{ id: 'u2', displayName: 'Ana', discriminator: '0042', avatarId: null }] : []),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<FriendsPage />)
    const input = await screen.findByLabelText('Find friends')
    typeQuery(input, 'ana')

    expect(await screen.findByText('#0042')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add friend' })).toBeInTheDocument()
  })

  it('adding a friend calls POST /api/friends/requests and disables the button', async () => {
    const fetchMock = mockFetch({
      search: () => [{ id: 'u2', displayName: 'Ana', discriminator: '0042', avatarId: null }],
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<FriendsPage />)
    const input = await screen.findByLabelText('Find friends')
    typeQuery(input, 'ana')

    fireEvent.click(await screen.findByRole('button', { name: 'Add friend' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/friends/requests',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ addresseeId: 'u2' }) }),
      ),
    )
    expect(await screen.findByRole('button', { name: 'Pending' })).toBeDisabled()
  })

  it('accepts an incoming request', async () => {
    const fetchMock = mockFetch({
      incoming: [{ requestId: 'r1', userId: 'u3', displayName: 'Bo', discriminator: '0001', avatarId: null, createdAtUtc: '2026-09-01T00:00:00Z' }],
      onAccept: () => jsonResponse({ userId: 'u3', displayName: 'Bo', discriminator: '0001', avatarId: null }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<FriendsPage />)
    expect(await screen.findByText('#0001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/friends/requests/r1/accept', expect.objectContaining({ method: 'POST' })),
    )
  })

  it('declines an incoming request', async () => {
    const fetchMock = mockFetch({
      incoming: [{ requestId: 'r1', userId: 'u3', displayName: 'Bo', discriminator: '0001', avatarId: null, createdAtUtc: '2026-09-01T00:00:00Z' }],
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<FriendsPage />)
    expect(await screen.findByText('#0001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/friends/requests/r1/decline', expect.objectContaining({ method: 'POST' })),
    )
  })

  it('removing a friend requires a confirm step', async () => {
    const fetchMock = mockFetch({
      friends: [{ userId: 'u4', displayName: 'Cy', discriminator: '0099', avatarId: null }],
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<FriendsPage />)
    expect(await screen.findByText('#0099')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    // Not yet called — the first click only arms the confirm state.
    expect(fetchMock).not.toHaveBeenCalledWith('/api/friends/u4', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/friends/u4', expect.objectContaining({ method: 'DELETE' })),
    )
  })
})
