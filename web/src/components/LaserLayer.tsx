import { motion } from 'framer-motion'
import { COLS, ROWS } from '../game/coords'
import { beamDurationMs, pathLength } from '../game/laser'
import { useDisplaySettings } from '../settings/displaySettings'
import { useGame } from '../store'

/**
 * A single dash — its length and speed come from the laser settings — travelling the full
 * beam path from the emitter to where it stops. Implemented as a stroke-dash on the beam
 * polyline whose offset animates linearly, so the dash bends around every reflection.
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
    strokeDasharray: `${laser.bulletLength} ${len + laser.bulletLength}`,
    initial: { strokeDashoffset: laser.bulletLength },
    animate: { strokeDashoffset: -len },
    transition: { duration: durationS, ease: 'linear' as const },
  }

  return (
    <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="h-full w-full overflow-visible">
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
