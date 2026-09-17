import type { RatingBucket } from '../api/authTypes'
import { RATING_CATEGORIES } from '../game/timeControls'
import { Badge } from '../ui/Badge'

/** Badge display order is frontend-owned (Bullet/Blitz/Rapid/Daily/Untimed, matching
 *  `RATING_CATEGORIES`) — the wire contract only pins the bucket *count* (always 5), not their
 *  order in the array. Looking each one up by name means a missing bucket degrades to fewer
 *  badges rather than shifting a later category into the wrong slot. */
export function orderedRatings(ratings: RatingBucket[]): RatingBucket[] {
  return RATING_CATEGORIES.flatMap((cat) => {
    const bucket = ratings.find((r) => r.category === cat)
    return bucket ? [bucket] : []
  })
}

/** One badge per rated category the account has a bucket for, tooltipped with the rated-games
 *  count and W/L record — shared by `ProfilePage` and the in-game player-info popup's
 *  real-profile variant (`backlog/09-player-info-popup.md`). */
export function RatingBadges({ ratings }: { ratings: RatingBucket[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {orderedRatings(ratings).map((bucket) => {
        const wins = bucket.wins ?? 0
        const losses = bucket.losses ?? 0
        return (
          <Badge
            key={bucket.category}
            variant="accent"
            title={`${bucket.gamesPlayed} rated game${bucket.gamesPlayed === 1 ? '' : 's'} (${wins}W–${losses}L)`}
          >
            {bucket.category} {bucket.rating}
          </Badge>
        )
      })}
    </div>
  )
}
