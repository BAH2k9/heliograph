import { useDisplaySettings } from '../settings/displaySettings'
import { Button } from '../ui/Button'
import { LaserPreview } from './LaserPreview'

export function DisplaySettingsPanel() {
  const laser = useDisplaySettings((s) => s.laser)
  const animation = useDisplaySettings((s) => s.animation)
  const setLaser = useDisplaySettings((s) => s.setLaser)
  const setAnimation = useDisplaySettings((s) => s.setAnimation)
  const reset = useDisplaySettings((s) => s.reset)

  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-2 font-medium text-text">Laser</h3>
        <LaserPreview />
        <div className="mt-3 space-y-3">
          <Range
            label="Speed"
            value={laser.speed}
            min={4}
            max={30}
            step={1}
            suffix=" sq/s"
            onChange={(v) => setLaser({ speed: v })}
          />
          <Range
            label="Bullet length"
            value={laser.bulletLength}
            min={0.25}
            max={4}
            step={0.05}
            suffix=" sq"
            onChange={(v) => setLaser({ bulletLength: v })}
          />
          <ColorField
            label="Glow colour"
            value={laser.glowColor}
            onChange={(v) => setLaser({ glowColor: v })}
          />
          <Range
            label="Glow opacity"
            value={laser.glowOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setLaser({ glowOpacity: v })}
          />
          <Range
            label="Glow width"
            value={laser.glowWidth}
            min={0.05}
            max={1}
            step={0.01}
            suffix=" sq"
            onChange={(v) => setLaser({ glowWidth: v })}
          />
          <ColorField
            label="Core colour"
            value={laser.coreColor}
            onChange={(v) => setLaser({ coreColor: v })}
          />
          <Range
            label="Core width"
            value={laser.coreWidth}
            min={0.02}
            max={0.5}
            step={0.01}
            suffix=" sq"
            onChange={(v) => setLaser({ coreWidth: v })}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium text-text">Animation</h3>
        <div className="space-y-3">
          <Range
            label="Move"
            value={animation.moveMs}
            min={0}
            max={800}
            step={20}
            suffix=" ms"
            onChange={(v) => setAnimation({ moveMs: v })}
          />
          <Range
            label="Destruction"
            value={animation.deathMs}
            min={100}
            max={1200}
            step={20}
            suffix=" ms"
            onChange={(v) => setAnimation({ deathMs: v })}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
    </div>
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer accent-select"
      />
      <span className="w-16 shrink-0 text-right tabular-nums text-text">
        {round(value)}
        {suffix}
      </span>
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-text-muted">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 shrink-0 cursor-pointer rounded bg-transparent"
      />
      <span className="w-16 shrink-0 text-right font-mono text-xs text-text-muted">{value}</span>
    </label>
  )
}
