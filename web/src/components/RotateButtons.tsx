import type { RotationDir } from '../api/types'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'

/**
 * Full-size rotate buttons for the selected piece — the touch-screen counterpart to the arrows
 * `RotationOverlay` draws on the piece. On a phone a board square is ~38px, smaller than a single
 * recommended touch target, so the two arrows inside it are too small to hit reliably; and since a
 * rotate commits the turn, a missed tap costs a move. These sit off the board, where there's room.
 * The caller decides when they show (PlayScreen gates them to coarse pointers).
 */
export function RotateButtons({
  onRotate,
  disabled,
  single,
  className,
}: {
  onRotate: (dir: RotationDir) => void
  disabled: boolean
  /** The Heliostat only toggles between two facings — one "Flip" button, same as RotationOverlay's `single`. */
  single?: boolean
  className?: string
}) {
  const buttonClass = 'h-12 flex-1 text-base'
  return (
    <div className={cn('flex gap-2', className)}>
      {single ? (
        <Button variant="secondary" className={buttonClass} disabled={disabled} onClick={() => onRotate('CW')}>
          <RotateIcon dir="CW" />
          Flip
        </Button>
      ) : (
        <>
          <Button variant="secondary" className={buttonClass} disabled={disabled} onClick={() => onRotate('CCW')}>
            <RotateIcon dir="CCW" />
            Rotate left
          </Button>
          <Button variant="secondary" className={buttonClass} disabled={disabled} onClick={() => onRotate('CW')}>
            Rotate right
            <RotateIcon dir="CW" />
          </Button>
        </>
      )}
    </div>
  )
}

function RotateIcon({ dir }: { dir: RotationDir }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Canonical Feather Icons "rotate-ccw" / "rotate-cw". */}
      {dir === 'CCW' ? (
        <>
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </>
      ) : (
        <>
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </>
      )}
    </svg>
  )
}
