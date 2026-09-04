// Client-side catalog of the fixed time-control presets (chess.com-style Bullet/Blitz/Rapid/
// Daily), driving `PlayHubScreen`'s category cards. Mirrors the values the plan's design doc
// assigns to `api/Domain/TimeControl.cs`'s `TimeControls` static class — these numbers
// (initialSeconds/incrementSeconds/daysPerMove) are fixed, conventional values, never
// player-configurable (no custom minute/increment input, per product decision).
//
// `wireName` is what would be sent as `CreateRoomRequest.TimeControl` (the persisted preset
// *name*, not raw numbers — matching how `Ruleset`/`Layout` are persisted today). It is
// UNCONFIRMED: the backend session (building BE-1..BE-4 in an isolated worktree) is the
// source of truth for the literal strings `TimeControls.ByName` will recognize, and was
// supposed to send them via the cross-session contract message described in the plan's A.7
// before FE-1/FE-2/FE-3 build against real clock data. That message never arrived this
// session (no working agent-to-agent channel was available), so FE-1/FE-2/FE-3 were not
// built. This file's `wireName` values are a placeholder guess, isolated here specifically so
// re-pointing all thirteen strings once the real names are confirmed is a one-file edit —
// nothing else in the frontend reads `wireName`.

export type TimeControlCategoryId = 'Bullet' | 'Blitz' | 'Rapid' | 'Daily'

export interface TimeControlPreset {
  /** Chess.com-style label shown on the card, e.g. "1+0", "3+2", "10+5", "3 days/move". */
  label: string
  /** UNCONFIRMED — see file header. What would be sent as CreateRoomRequest.TimeControl. */
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
