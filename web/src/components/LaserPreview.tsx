import { motion } from 'framer-motion'
import { useDisplaySettings } from '../settings/displaySettings'

// A straight strip 10 "squares" wide, so widths/lengths read the same as on the board.
const SQUARES = 10

/** A looping bullet on a straight track, so the laser settings can be tuned by eye. */
export function LaserPreview() {
  const laser = useDisplaySettings((s) => s.laser)

  const len = SQUARES
  const durationS = (len + laser.bulletLength) / laser.speed
  const flight = {
    points: `0,1 ${SQUARES},1`,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeDasharray: `${laser.bulletLength} ${len + laser.bulletLength}`,
    animate: { strokeDashoffset: [laser.bulletLength, -len] },
    transition: {
      duration: durationS,
      ease: 'linear' as const,
      repeat: Infinity,
      repeatDelay: 0.3,
    },
  }

  // Re-key on any laser change so the animation restarts with the new values.
  const k = JSON.stringify(laser)

  return (
    <svg
      viewBox={`0 0 ${SQUARES} 2`}
      preserveAspectRatio="none"
      className="h-9 w-full rounded bg-slate-950"
    >
      <motion.polyline
        key={`glow-${k}`}
        {...flight}
        stroke={laser.glowColor}
        strokeOpacity={laser.glowOpacity}
        strokeWidth={laser.glowWidth}
      />
      <motion.polyline key={`core-${k}`} {...flight} stroke={laser.coreColor} strokeWidth={laser.coreWidth} />
    </svg>
  )
}
