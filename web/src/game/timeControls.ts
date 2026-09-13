// Client-side catalog of the fixed time-control presets (chess.com-style Bullet/Blitz/Rapid/
// Daily), driving `PlayHubScreen`'s category cards and `GameClock`'s category lookup. Mirrors
// the values in `Khet.Clock/TimeControl.cs`'s `TimeControls` static class — these numbers
// (initialSeconds/incrementSeconds/daysPerMove) are fixed, conventional values, never
// player-configurable (no custom minute/increment input, per product decision).
//
// `wireName` is what's sent as `CreateRoomRequest.TimeControl`, and what `GameResponse
// .timeControl` / `SubmitMoveResponse.timeControl` come back as (the persisted preset *name*,
// not raw numbers — matching how `Ruleset`/`Layout` are persisted today). Confirmed by the
// backend session's contract message (BE-2): all 13 literal strings here are exact.

export type TimeControlCategoryId = 'Bullet' | 'Blitz' | 'Rapid' | 'Daily'

export interface TimeControlPreset {
  /** Chess.com-style label shown on the card, e.g. "1+0", "3+2", "10+5", "3 days/move". */
  label: string
  /** Exact string sent/received as `CreateRoomRequest`/`GameResponse.timeControl`. */
  wireName: string
  initialSeconds: number | null
  incrementSeconds: number | null
  /** Daily only; null for live (Bullet/Blitz/Rapid) presets. */
  daysPerMove: number | null
}

export interface TimeControlCategory {
  id: TimeControlCategoryId
  blurb: string
  presets: TimeControlPreset[]
}

export const TIME_CONTROL_CATEGORIES: TimeControlCategory[] = [
  {
    id: 'Bullet',
    blurb: 'Fast and ruthless — seconds per side.',
    presets: [
      { label: '1+0', wireName: '1+0', initialSeconds: 60, incrementSeconds: 0, daysPerMove: null },
      { label: '1+1', wireName: '1+1', initialSeconds: 60, incrementSeconds: 1, daysPerMove: null },
      { label: '2+1', wireName: '2+1', initialSeconds: 120, incrementSeconds: 1, daysPerMove: null },
    ],
  },
  {
    id: 'Blitz',
    blurb: 'Quick games with just enough room to think.',
    presets: [
      { label: '3+0', wireName: '3+0', initialSeconds: 180, incrementSeconds: 0, daysPerMove: null },
      { label: '3+2', wireName: '3+2', initialSeconds: 180, incrementSeconds: 2, daysPerMove: null },
      { label: '5+0', wireName: '5+0', initialSeconds: 300, incrementSeconds: 0, daysPerMove: null },
      { label: '5+3', wireName: '5+3', initialSeconds: 300, incrementSeconds: 3, daysPerMove: null },
    ],
  },
  {
    id: 'Rapid',
    blurb: 'Real strategy, still finished in one sitting.',
    presets: [
      { label: '10+0', wireName: '10+0', initialSeconds: 600, incrementSeconds: 0, daysPerMove: null },
      { label: '10+5', wireName: '10+5', initialSeconds: 600, incrementSeconds: 5, daysPerMove: null },
      { label: '15+10', wireName: '15+10', initialSeconds: 900, incrementSeconds: 10, daysPerMove: null },
    ],
  },
  {
    id: 'Daily',
    blurb: 'Correspondence play — one move at a time, over days.',
    presets: [
      { label: '1 day/move', wireName: '1/move', initialSeconds: null, incrementSeconds: null, daysPerMove: 1 },
      { label: '3 days/move', wireName: '3/move', initialSeconds: null, incrementSeconds: null, daysPerMove: 3 },
      { label: '7 days/move', wireName: '7/move', initialSeconds: null, incrementSeconds: null, daysPerMove: 7 },
    ],
  },
]

/**
 * Looks up a preset by its wire name (`GameResponse.timeControl`/`SubmitMoveResponse
 * .timeControl`), so `GameClock` can tell a live time control from Daily (no live ticking UI —
 * just a coarse day/hour label) without the server needing to send the category separately.
 * Returns null for an untimed game (`timeControl === null`) or an unrecognized name.
 */
export function findTimeControlPreset(wireName: string | null): TimeControlPreset | null {
  if (!wireName) return null
  for (const category of TIME_CONTROL_CATEGORIES) {
    const preset = category.presets.find((p) => p.wireName === wireName)
    if (preset) return preset
  }
  return null
}

/**
 * All 5 `ApplicationUser` rating-bucket categories, display order — `TIME_CONTROL_CATEGORIES`'
 * four plus `Khet.Clock.TimeControlCategory.Untimed`, the bucket a rated game with no time control
 * moves (see `GameEndService.ApplyEloAsync`). Kept separate from `TIME_CONTROL_CATEGORIES` itself:
 * that array drives the time-control *preset picker* (`PlayHubScreen`/`InvitePlayScreen`), and
 * Untimed has no presets to pick — it's what leaving the picker on "Untimed" already means.
 * `ProfilePage`/`LeaderboardPage` are the two consumers that list rating categories rather than
 * pickable presets.
 */
export const RATING_CATEGORIES: readonly (TimeControlCategoryId | 'Untimed')[] = [
  ...TIME_CONTROL_CATEGORIES.map((c) => c.id),
  'Untimed',
]
