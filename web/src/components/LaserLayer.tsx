import { motion } from 'framer-motion'
import { useId } from 'react'
import { COLS, ROWS } from '../game/coords'
import { beamDurationMs, pathLength } from '../game/laser'
import { useDisplaySettings } from '../settings/displaySettings'
import { useGame } from '../store'

/**
 * A single dash — its length and speed come from the laser settings — travelling the full
 * beam path from the emitter to where it stops. Implemented as a stroke-dash on the beam
 * polyline whose offset animates linearly, so the dash bends around every reflection.
 *
 * Rendering only: every colour and width is sourced from `useDisplaySettings().laser`.
 * The glow polyline is blurred by an SVG filter (no colour of its own — it just softens
 * whatever `glowColor` the user picked); the core polyline stays crisp. Round caps + joins
 * keep the travelling dash from spiking at reflection corners.
 */
export function LaserLayer() {
  const beam = useGame((s) => s.beam)
  const laser = useDisplaySettings((s) => s.laser)
  // Unique per instance so a second board on the page (e.g. /kitchen-sink) can't collide.
  const filterId = `laser-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
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
      <defs>
        {/* viewBox units are board squares, so the blur is a fraction of a square. An
         * explicit oversized region (userSpaceOnUse) stops the long thin polyline's
         * default filter box from clipping the glow. */}
        <filter
          id={filterId}
          filterUnits="userSpaceOnUse"
          x={-2}
          y={-2}
          width={COLS + 4}
          height={ROWS + 4}
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation={Math.max(laser.glowWidth * 0.4, 0.04)} />
        </filter>
      </defs>
      <motion.polyline
        key={`${beam.id}-glow`}
        {...flight}
        stroke={laser.glowColor}
        strokeOpacity={laser.glowOpacity}
        strokeWidth={laser.glowWidth}
        filter={`url(#${filterId})`}
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
