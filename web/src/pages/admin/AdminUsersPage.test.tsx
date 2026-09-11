import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminUsersPage } from './AdminUsersPage'
import type { AdminUserRow } from '../../api/adminTypes'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const ana: AdminUserRow = {
  id: 'u1',
  email: 'ana@example.com',
  displayName: 'Ana',
  isAdmin: false,
  isDisabled: false,
  createdAtUtc: '2026-01-02T00:00:00Z',
  ratings: [
    { category: 'Bullet', rating: 1200, gamesPlayed: 0 },
    { category: 'Blitz', rating: 1250, gamesPlayed: 4 },
    { category: 'Rapid', rating: 1200, gamesPlayed: 0 },
    { category: 'Daily', rating: 1200, gamesPlayed: 0 },
  ],
  activeSessionCount: 1,
}

const listBody = { users: [ana], total: 1, page: 1, pageSize: 20 }

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AdminUsersPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminUsersPage', () => {
  it('lists accounts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(listBody)))
    renderPage()

    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
  })

  it('debounces the search box into a query param', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(listBody)))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    await screen.findByText('Ana')

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ana' } })

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('search=ana'))).toBe(true)
    })
  })

  it('opens the row dialog and grants admin via PATCH', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(listBody)) // initial list
      .mockResolvedValueOnce(jsonResponse({ ...ana, isAdmin: true })) // patchUser
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.click(await screen.findByText('Ana'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make admin' }))

    await within(dialog).findByText('Admin granted')
    const patchCall = fetchMock.mock.calls[1]
    expect(patchCall[0]).toContain('/api/admin/users/u1')
    expect(patchCall[1].method).toBe('PATCH')
    expect(JSON.parse(patchCall[1].body)).toEqual({ isAdmin: true })
  })

  it('shows an error when the list fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500)))
    renderPage()

    expect(await screen.findByText(/Couldn't load users: nope/)).toBeInTheDocument()
  })
})
