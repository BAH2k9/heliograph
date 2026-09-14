import { createContext, useContext, type ReactNode } from 'react'
import { useClockAutoClaim, type ClockDisplay } from './GameClock'

interface GameClocks {
  P1: ClockDisplay | null
  P2: ClockDisplay | null
}

const emptyClocks: GameClocks = { P1: null, P2: null }

const GameClockContext = createContext<GameClocks>(emptyClocks)

/**
 * Mounts the one instance of `useClockAutoClaim` — see its own doc for why this must never be
 * duplicated — at `AppLayout`, above the route outlet, so both `PlayScreen` and `ActiveGameBanner`
 * can read the same ticking clock/auto-claim-timeout state while showing at most one of
 * themselves at a time (the banner hides itself on `/play`). Wraps `children` rather than
 * rendering them inline so a clock tick (every `TICK_MS`) only re-renders this provider and its
 * actual `useContext` consumers — the `children` prop reference is unchanged from `AppLayout`'s
 * own last render, so React bails out of re-rendering the rest of the tree (the board included)
 * on every tick.
 */
export function GameClockProvider({ children }: { children: ReactNode }) {
  const clocks = useClockAutoClaim()
  return <GameClockContext.Provider value={clocks}>{children}</GameClockContext.Provider>
}

/** Reads the shared clock state — null/null outside `GameClockProvider` (never expected in the
 *  real app; only a test harness that doesn't wrap one would see it). */
export function useGameClocks(): GameClocks {
  return useContext(GameClockContext)
}
