import type { RatingBucket } from '../api/authTypes'

/** All 4 `TimeControlCategory` buckets at the 1200/0 default — matches what a fresh account's
 *  `UserProfile.ratings` looks like on the wire. */
export function defaultRatings(): RatingBucket[] {
  return [
    { category: 'Bullet', rating: 1200, gamesPlayed: 0 },
    { category: 'Blitz', rating: 1200, gamesPlayed: 0 },
    { category: 'Rapid', rating: 1200, gamesPlayed: 0 },
    { category: 'Daily', rating: 1200, gamesPlayed: 0 },
  ]
}
