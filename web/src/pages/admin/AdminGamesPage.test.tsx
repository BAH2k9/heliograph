import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminGamesPage } from './AdminGamesPage'
import type { AdminGameRow } from '../../api/adminTypes'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const inProgress: AdminGameRow = {
  id: 'g1',
  status: 'InProgress',
  endReason: null,
  ruleset: 'FixedSun',
  layout: 'Dawn',
  timeControl: '5+0',
  rated: true,
  moveCount: 8,
  seatsTaken: 2,
  joinCode: 'ABC123',
  p1UserId: 'u1',
  p1DisplayName: 'Ana',
  p2UserId: 'u2',
  p2DisplayName: 'Bo',
  createdAtUtc: '2026-02-01T00:00:00Z',
  finishedAtUtc: null,
}

const finishedRated: AdminGameRow = {
  ...inProgress,
  id: 'g2',
  status: 'P1Win',
  endReason: 'Keep',
  joinCode: null,
  finishedAtUtc: '2026-02-01T01:00:00Z',
}

const listBody = (games: AdminGameRow[]) => ({ games, total: games.length, page: 1, pageSize: 20 })

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/games']}>
      <AdminGamesPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminGamesPage', () => {
  it('lists games', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(listBody([inProgress]))))
    renderPage()

    expect(await screen.findByText('Ana vs Bo')).toBeInTheDocument()
    expect(screen.getByText('InProgress')).toBeInTheDocument()
  })

  it('refetches with a status filter', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(listBody([inProgress]))))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    await screen.findByText('Ana vs Bo')

    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'InProgress' } })

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('status=InProgress'))).toBe(true)
    })
  })

  it('force-ends an in-progress game', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(listBody([inProgress])))
      .mockResolvedValueOnce(jsonResponse({ status: 'P1Win', endReason: 'Aborted', serverNowUtc: 'now' }))
      .mockResolvedValueOnce(jsonResponse(listBody([]))) // reload
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.click(await screen.findByText('Ana vs Bo'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'P1 wins' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls[1]
      expect(call[0]).toContain('/api/admin/games/g1/force-end')
      expect(JSON.parse(call[1].body)).toEqual({ winner: 'P1' })
    })
  })

  it('warns before deleting a finished rated game', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(listBody([finishedRated]))))
    renderPage()

    fireEvent.click(await screen.findByText('Ana vs Bo'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/will not reverse the Elo/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'P1 wins' })).toBeNull() // not in progress
  })
})
