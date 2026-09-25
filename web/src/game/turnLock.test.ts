import { describe, expect, it } from 'vitest'
import { canAct, hasActiveGame, seatStatus } from './turnLock'

describe('canAct', () => {
  it('lets solo play act on any turn', () => {
    expect(canAct(null, 'P1', 'InProgress')).toBe(true)
    expect(canAct(null, 'P2', 'InProgress')).toBe(true)
  })

  it('lets a seated player act only on their own turn', () => {
    expect(canAct('P1', 'P1', 'InProgress')).toBe(true)
    expect(canAct('P1', 'P2', 'InProgress')).toBe(false)
    expect(canAct('P2', 'P2', 'InProgress')).toBe(true)
  })

  it('never lets a spectator act', () => {
    expect(canAct('Spectator', 'P1', 'InProgress')).toBe(false)
    expect(canAct('Spectator', 'P2', 'InProgress')).toBe(false)
  })

  it('blocks everyone once the game is over', () => {
    expect(canAct(null, 'P1', 'P1Win')).toBe(false)
    expect(canAct('P1', 'P1', 'P1Win')).toBe(false)
  })

  it('refuses to let anyone act on the bot\'s own turn, even solo play', () => {
    // Bot games have no room seat (same as local play), so without the `botSeat` check the
    // `seat === null` branch would otherwise let the human move for the bot — see
    // `backlog/08-bot-opponent.md`.
    expect(canAct(null, 'P2', 'InProgress', 'P2')).toBe(false)
    expect(canAct(null, 'P1', 'InProgress', 'P2')).toBe(true)
  })

  it('a non-bot game (botSeat null) behaves exactly as before', () => {
    expect(canAct(null, 'P1', 'InProgress', null)).toBe(true)
    expect(canAct(null, 'P2', 'InProgress', null)).toBe(true)
  })
})

describe('seatStatus', () => {
  it('is empty for solo play', () => {
    expect(seatStatus(null, 'P1', 'InProgress')).toBe('')
  })

  it('reports whose turn it is for a seated player', () => {
    expect(seatStatus('P1', 'P1', 'InProgress')).toBe('Your turn')
    expect(seatStatus('P1', 'P2', 'InProgress')).toBe('Waiting for opponent')
  })

  it('marks spectators', () => {
    expect(seatStatus('Spectator', 'P2', 'InProgress')).toBe('Spectating — Cobalt to move')
  })

  it('reports game over regardless of seat', () => {
    expect(seatStatus('P2', 'P1', 'P1Win')).toBe('Game over')
  })
})

describe('hasActiveGame', () => {
  it('is true for any in-progress game, seated or not', () => {
    expect(hasActiveGame('g1', 'InProgress')).toBe(true)
  })

  it('is false once the game is over', () => {
    expect(hasActiveGame('g1', 'P1Win')).toBe(false)
    expect(hasActiveGame('g1', 'P2Win')).toBe(false)
  })

  it('is false with no active game at all', () => {
    expect(hasActiveGame(null, 'InProgress')).toBe(false)
  })

  it('is false for a spectator — nothing for them to resign, so nothing should trap them', () => {
    expect(hasActiveGame('g1', 'InProgress', 'Spectator')).toBe(false)
  })
})
