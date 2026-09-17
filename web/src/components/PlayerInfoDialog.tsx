import { useEffect, useState } from 'react'
import type { BotDifficulty, Player, PublicPlayerProfile } from '../api/types'
import { ApiError, getPlayerProfile } from '../api/client'
import { Avatar } from './Avatar'
import { RatingBadges } from './RatingBadges'
import { Dialog, DialogContent } from '../ui/Dialog'

/** What `PlayScreen` clicked: a real claimed seat (fetched on open), a Local Play hotseat
 *  character (already known client-side), or the bot's invented persona — see
 *  `backlog/09-player-info-popup.md`. */
export type PlayerInfoTarget =
  | { kind: 'real'; gameId: string; seat: Player }
  | { kind: 'hotseat'; displayName: string; avatarId: string; bio: string }
  | { kind: 'bot'; displayName: string; bio: string; difficulty: BotDifficulty | null }

/**
 * The in-game player-info popup opened by clicking a `PlayerCard` — three content variants
 * sharing one `Dialog`, same controlled `open`/`onClose` shape as `BotGameDialog`.
 * `target === null` means closed; switching to a non-null target (a new click while one's
 * already open) re-fetches for the `'real'` variant since it's keyed by seat.
 */
export function PlayerInfoDialog({ target, onClose }: { target: PlayerInfoTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      {target && (
        <DialogContent title="Player info" hideTitle size="sm">
          {target.kind === 'real' ? (
            <RealProfileContent gameId={target.gameId} seat={target.seat} />
          ) : (
            <PersonaContent
              displayName={target.displayName}
              avatarId={target.kind === 'hotseat' ? target.avatarId : null}
              bio={target.bio}
              difficulty={target.kind === 'bot' ? target.difficulty : undefined}
            />
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

function PersonaContent({
  displayName,
  avatarId,
  bio,
  difficulty,
}: {
  displayName: string
  avatarId: string | null
  bio: string
  /** `undefined` for a hotseat character (no difficulty concept); a real value for the bot. */
  difficulty?: BotDifficulty | null
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center">
      <Avatar avatarId={avatarId} displayName={displayName} size="lg" />
      <h2 className="text-lg font-semibold text-text">{displayName}</h2>
      {difficulty !== undefined && (
        <p className="text-xs uppercase tracking-wide text-text-subtle">Difficulty: {difficulty ?? 'Unknown'}</p>
      )}
      <p className="text-sm text-text-muted">{bio}</p>
    </div>
  )
}

function RealProfileContent({ gameId, seat }: { gameId: string; seat: Player }) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError(null)
    getPlayerProfile(gameId, seat)
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [gameId, seat])

  if (error) {
    return <p className="py-4 text-center text-sm text-danger">Couldn't load this player: {error}</p>
  }

  if (!profile) {
    return <p className="py-4 text-center text-sm text-text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center">
      <Avatar avatarId={profile.avatarId} displayName={profile.displayName} size="lg" />
      <h2 className="text-lg font-semibold text-text">{profile.displayName}</h2>
      <p className="text-xs text-text-subtle">{profile.totalGamesPlayed} rated games played</p>
      <RatingBadges ratings={profile.ratings} />
    </div>
  )
}
