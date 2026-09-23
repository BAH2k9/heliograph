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
  /** Extra beat held after the Keep itself is destroyed — a more deliberate death than an
   *  ordinary piece's, played before the win popup appears. */
  keepDeathMs: number
}

export interface DisplaySettings {
  laser: LaserSettings
  animation: AnimationSettings
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  laser: {
    bulletLength: 1,
    speed: 12,
    // Warm gold, drawn as two values: a deep-amber halo around a pale-gold core. On the light
    // board the halo carries the contrast; on the dark chrome the core does. Over a Brass piece
    // (index.css, lighter than the halo and darker than the core) both edges still show.
    glowColor: '#b86800',
    glowOpacity: 0.75,
    glowWidth: 0.3,
    coreColor: '#ffe6a0',
    coreWidth: 0.1,
  },
  animation: {
    moveMs: 200,
    deathMs: 420,
    keepDeathMs: 900,
  },
}

/**
 * Persisted-state version. 2 = the gold beam of the Heliograph rebrand. `persist` saves the whole
 * laser object and `merge` lets saved values win, so without this everyone who had opened the app
 * would keep the old beam colours. A version-1 save drops its beam colours (and the glow opacity
 * tuned for them) and keeps everything else; the defaults fill the gap.
 */
const PERSIST_VERSION = 2

export function migrateDisplaySettings(persisted: unknown, fromVersion: number): Partial<DisplaySettings> {
  const p = (persisted ?? {}) as Partial<DisplaySettings>
  if (fromVersion >= 2 || !p.laser) return p
  const laser: Partial<LaserSettings> = { ...p.laser }
  delete laser.glowColor
  delete laser.glowOpacity
  delete laser.coreColor
  return { ...p, laser: laser as LaserSettings }
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
      name: 'heliograph.displaySettings',
      version: PERSIST_VERSION,
      migrate: (persisted, version) => migrateDisplaySettings(persisted, version) as DisplaySettingsStore,
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
