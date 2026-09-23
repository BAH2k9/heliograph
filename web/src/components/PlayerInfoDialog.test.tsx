import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerInfoDialog, type PlayerInfoTarget } from './PlayerInfoDialog'
import { ApiError } from '../api/client'
import type { PublicPlayerProfile } from '../api/types'

const getPlayerProfileMock = vi.fn()

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client')
  return { ...actual, getPlayerProfile: (...args: unknown[]) => getPlayerProfileMock(...args) }
})

afterEach(() => {
  getPlayerProfileMock.mockReset()
})

describe('PlayerInfoDialog', () => {
  it('renders nothing when target is null', () => {
    render(<PlayerInfoDialog target={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fetches and renders the real-profile variant', async () => {
    const profile: PublicPlayerProfile = {
      displayName: 'Ada',
      avatarId: 'sphinx',
      totalGamesPlayed: 12,
      ratings: [{ category: 'Blitz', rating: 1350, gamesPlayed: 12, wins: 7, losses: 5 }],
    }
    getPlayerProfileMock.mockResolvedValue(profile)
    const target: PlayerInfoTarget = { kind: 'real', gameId: 'g1', seat: 'P1' }

    render(<PlayerInfoDialog target={target} onClose={() => {}} />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())
    expect(screen.getByText('12 rated games played')).toBeInTheDocument()
    expect(screen.getByText('Blitz 1350')).toBeInTheDocument()
    expect(getPlayerProfileMock).toHaveBeenCalledWith('g1', 'P1')
  })

  it('shows an error message when the real-profile fetch fails', async () => {
    getPlayerProfileMock.mockRejectedValue(new ApiError(404, 'no claimed player'))
    const target: PlayerInfoTarget = { kind: 'real', gameId: 'g1', seat: 'P2' }

    render(<PlayerInfoDialog target={target} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Couldn't load this player/)).toBeInTheDocument())
    expect(screen.getByText(/no claimed player/)).toBeInTheDocument()
  })

  it('renders the hotseat character variant with no network call', () => {
    const target: PlayerInfoTarget = {
      kind: 'hotseat',
      displayName: 'Keeper Ashgill',
      avatarId: 'sphinx',
      bio: 'Guards the Keep as if it were the telescope.',
    }

    render(<PlayerInfoDialog target={target} onClose={() => {}} />)

    expect(screen.getByText('Keeper Ashgill')).toBeInTheDocument()
    expect(screen.getByText('Guards the Keep as if it were the telescope.')).toBeInTheDocument()
    expect(getPlayerProfileMock).not.toHaveBeenCalled()
  })

  it('renders the bot persona variant with its real difficulty and no network call', () => {
    const target: PlayerInfoTarget = {
      kind: 'bot',
      displayName: 'Gauge-7',
      bio: 'Runs on pure minimax and spite.',
      difficulty: 'Hard',
    }

    render(<PlayerInfoDialog target={target} onClose={() => {}} />)

    expect(screen.getByText('Gauge-7')).toBeInTheDocument()
    expect(screen.getByText(/Difficulty: Hard/)).toBeInTheDocument()
    expect(screen.getByText('Runs on pure minimax and spite.')).toBeInTheDocument()
    expect(getPlayerProfileMock).not.toHaveBeenCalled()
  })
})
