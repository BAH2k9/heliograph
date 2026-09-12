import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** How the laser bullet looks and moves. */
export interface LaserSettings {
  /** Length of the travelling bullet, in board-square units. */
  bulletLength: number
  /** Bullet travel speed, in squares per second (constant regardless of path length). */
  speed: number
  glowColor: string
  /** 0–1. */
  glowOpacity: number
  /** Stroke width of the glow, in square units. */
  glowWidth: number
  coreColor: string
  /** Stroke width of the bright core, in square units. */
  coreWidth: number
}

/** Animation timings, in milliseconds. The store sleeps for these; components animate for them. */
export interface AnimationSettings {
  /** Piece slide / rotate after a move is applied. */
  moveMs: number
  /** A piece being destroyed by the laser: a quick pop, then it vanishes. */
  deathMs: number
  /** Extra beat held after the Pharaoh itself is destroyed — a more deliberate death than an
   *  ordinary piece's, played before the win popup appears. */
  pharaohDeathMs: number
}

export interface DisplaySettings {
  laser: LaserSettings
  animation: AnimationSettings
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  laser: {
    bulletLength: 1,
    speed: 12,
    glowColor: '#ef4444',
    glowOpacity: 0.4,
    glowWidth: 0.3,
    coreColor: '#fee2e2',
    coreWidth: 0.1,
  },
  animation: {
    moveMs: 200,
    deathMs: 420,
    pharaohDeathMs: 900,
  },
}

interface DisplaySettingsStore extends DisplaySettings {
  setLaser: (patch: Partial<LaserSettings>) => void
  setAnimation: (patch: Partial<AnimationSettings>) => void
  reset: () => void
}

export const useDisplaySettings = create<DisplaySettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_DISPLAY_SETTINGS,
      setLaser: (patch) => set((s) => ({ laser: { ...s.laser, ...patch } })),
      setAnimation: (patch) => set((s) => ({ animation: { ...s.animation, ...patch } })),
      reset: () => set({ ...DEFAULT_DISPLAY_SETTINGS }),
    }),
    {
      name: 'khet.displaySettings',
      version: 1,
      // Merge field-by-field so adding new settings later doesn't drop them for existing users.
      merge: (persisted, current) => {
        const p = persisted as Partial<DisplaySettings> | undefined
        return {
          ...current,
          laser: { ...current.laser, ...(p?.laser ?? {}) },
          animation: { ...current.animation, ...(p?.animation ?? {}) },
        }
      },
    },
  ),
)
