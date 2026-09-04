import type { Coord } from '../api/types'
import { COLS, ROWS } from '../game/coords'

/**
 * A small toggle on a selected two-high obelisk. Off (default): clicking an adjacent empty
 * square moves the whole stack there, same as any other piece. Armed: the same click instead
 * splits the stack, dropping one obelisk onto that square. Sits in the lower-right of the
 * square, mirroring the placement idiom of RotationOverlay.
 */
export function StackOverlay({
  at,
  armed,
  disabled,
  onToggle,
}: {
  at: Coord
  armed: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 flex items-end justify-end p-[6%]"
      style={{
        width: `${100 / COLS}%`,
        height: `${100 / ROWS}%`,
        transform: `translate(${at.col * 100}%, ${at.row * 100}%)`,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        aria-pressed={armed}
        aria-label={
          armed
            ? 'Splitting the stack — click an adjacent square to drop one obelisk there'
            : 'Split the stack instead of moving it whole'
        }
        title={armed ? 'Unstacking — pick a square' : 'Split stack'}
        className={[
          'pointer-events-auto rounded px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase leading-none shadow transition-colors',
          armed ? 'bg-sky-500 text-white' : 'bg-white/85 text-slate-800 hover:bg-white',
          disabled ? 'opacity-30' : '',
        ].join(' ')}
      >
        split
      </button>
    </div>
  )
}
