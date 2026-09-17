import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { orderedRatings, RatingBadges } from './RatingBadges'
import type { RatingBucket } from '../api/authTypes'

const RATINGS: RatingBucket[] = [
  { category: 'Untimed', rating: 1200, gamesPlayed: 0, wins: 0, losses: 0 },
  { category: 'Blitz', rating: 1350, gamesPlayed: 12, wins: 7, losses: 5 },
  { category: 'Bullet', rating: 1200, gamesPlayed: 0, wins: 0, losses: 0 },
  { category: 'Rapid', rating: 1200, gamesPlayed: 0, wins: 0, losses: 0 },
  { category: 'Daily', rating: 1200, gamesPlayed: 0, wins: 0, losses: 0 },
]

describe('orderedRatings', () => {
  it('orders buckets Bullet/Blitz/Rapid/Daily/Untimed regardless of input order', () => {
    expect(orderedRatings(RATINGS).map((r) => r.category)).toEqual(['Bullet', 'Blitz', 'Rapid', 'Daily', 'Untimed'])
  })

  it('degrades to fewer badges when a bucket is missing rather than misaligning the rest', () => {
    const missingBlitz = RATINGS.filter((r) => r.category !== 'Blitz')
    expect(orderedRatings(missingBlitz).map((r) => r.category)).toEqual(['Bullet', 'Rapid', 'Daily', 'Untimed'])
  })
})

describe('RatingBadges', () => {
  it('renders one badge per bucket with the rating in the label', () => {
    render(<RatingBadges ratings={RATINGS} />)
    expect(screen.getByText('Blitz 1350')).toBeInTheDocument()
    expect(screen.getByText('Untimed 1200')).toBeInTheDocument()
  })

  it("tooltips the rated-games count and W/L record", () => {
    render(<RatingBadges ratings={RATINGS} />)
    expect(screen.getByText('Blitz 1350')).toHaveAttribute('title', '12 rated games (7W–5L)')
  })

  it('treats a missing wins/losses as 0 (fixture-compat)', () => {
    render(<RatingBadges ratings={[{ category: 'Bullet', rating: 1200, gamesPlayed: 0 }]} />)
    expect(screen.getByText('Bullet 1200')).toHaveAttribute('title', '0 rated games (0W–0L)')
  })
})
