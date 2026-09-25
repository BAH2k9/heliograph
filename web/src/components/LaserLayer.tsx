import { motion } from 'framer-motion'
import { COLS, ROWS } from '../game/coords'
import { beamDurationMs, pathLength } from '../game/laser'
import { useDisplaySettings } from '../settings/displaySettings'
import { useGame } from '../store'

/** How much wider than `glowWidth` the soft outer halo is, and how much fainter. */
const HALO_WIDTH_SCALE = 2
const HALO_OPACITY_SCALE = 0.35

/**
 * A single dash — its length and speed come from the laser settings — travelling the full
 * beam path from the emitter to where it stops. Implemented as a stroke-dash on the beam
 * polyline whose offset animates linearly, so the dash bends around every reflection.
 *
 * Rendering only: every colour and width is sourced from `useDisplaySettings().laser`.
 * The glow is two plain translucent strokes, a wide faint halo under the `glowWidth` band,
 * with the crisp core on top. Round caps + joins keep the travelling dash from spiking at
 * reflection corners.
 *
 * **No SVG/CSS filter here.** The glow used to be an `feGaussianBlur` sized to cover the whole
 * board, and because the dash moves every frame that blur was redone every frame. On phones that
 * run SVG filters on the CPU that dropped the beam to ~2 fps (`docs/bugs/phone-animation-jank.md`).
 * Stacked strokes look close enough and cost nothing to repaint. `LaserLayer.test.tsx` guards it.
 */
export function LaserLayer() {
  const beam = useGame((s) => s.beam)
  const laser = useDisplaySettings((s) => s.laser)
  if (!beam) return null

  const points = beam.points.map((p) => `${p.x},${p.y}`).join(' ')
  const len = pathLength(beam.points)
  const durationS =
    beamDurationMs(beam.points, { speed: laser.speed, bulletLength: laser.bulletLength }) / 1000

  const flight = {
    points,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeDasharray: `${laser.bulletLength} ${len + laser.bulletLength}`,
    initial: { strokeDashoffset: laser.bulletLength },
    animate: { strokeDashoffset: -len },
    transition: { duration: durationS, ease: 'linear' as const },
  }

  return (
    <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="h-full w-full overflow-visible">
      <motion.polyline
        key={`${beam.id}-halo`}
        {...flight}
        stroke={laser.glowColor}
        strokeOpacity={laser.glowOpacity * HALO_OPACITY_SCALE}
        strokeWidth={laser.glowWidth * HALO_WIDTH_SCALE}
      />
      <motion.polyline
        key={`${beam.id}-glow`}
        {...flight}
        stroke={laser.glowColor}
        strokeOpacity={laser.glowOpacity}
        strokeWidth={laser.glowWidth}
      />
      <motion.polyline
        key={`${beam.id}-core`}
        {...flight}
        stroke={laser.coreColor}
        strokeWidth={laser.coreWidth}
      />
    </svg>
  )
}
