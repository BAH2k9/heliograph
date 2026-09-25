import type { Coord } from '../api/types'
import { pieceAt } from '../game/board'
import { COLS, ROWS, coordKey, sameCoord } from '../game/coords'
import { canRotate, squareOwner } from '../game/rules'
import { useGame } from '../store'
import { LaserLayer } from './LaserLayer'
import { KeepDownEffect } from './KeepDownEffect'
import { PieceOnBoard } from './PieceOnBoard'
import { RotationOverlay } from './RotationOverlay'
import { StackOverlay } from './StackOverlay'

export function Board() {
  const board = useGame((s) => s.board)
  const selected = useGame((s) => s.selected)
  const legalTargets = useGame((s) => s.legalTargets)
  const stackTargets = useGame((s) => s.stackTargets)
  const unstackTargets = useGame((s) => s.unstackTargets)
  const unstackArmed = useGame((s) => s.unstackArmed)
  const dying = useGame((s) => s.dying)
  const keepDown = useGame((s) => s.keepDown)
  const busy = useGame((s) => s.busy)
  const selectSquare = useGame((s) => s.selectSquare)
  const moveTo = useGame((s) => s.moveTo)
  const rotateSelected = useGame((s) => s.rotateSelected)
  const stackTo = useGame((s) => s.stackTo)
  const unstackTo = useGame((s) => s.unstackTo)
  const toggleUnstackArmed = useGame((s) => s.toggleUnstackArmed)
  const clearSelection = useGame((s) => s.clearSelection)

  if (!board) return null

  const selectedPiece = selected ? pieceAt(board, selected) : undefined
  const showRotation = selected != null && selectedPiece != null && canRotate(selectedPiece)
  const showStackOverlay =
    selected != null &&
    selectedPiece != null &&
    selectedPiece.kind === 'Bastion' &&
    (selectedPiece.health ?? 1) === 2 &&
    unstackTargets.length > 0

  const legalSet = new Set(legalTargets.map(coordKey))
  const stackSet = new Set(stackTargets.map(coordKey))
  const unstackSet = new Set(unstackTargets.map(coordKey))

  function handleSquare(c: Coord) {
    if (busy) return
    const key = coordKey(c)
    // Stack targets are occupied friendly-Bastion squares (never legal move targets, so this
    // never shadows a Swivel swap); unstack targets only act while armed via the StackOverlay.
    if (selected && unstackArmed && unstackSet.has(key)) {
      void unstackTo(c)
      return
    }
    if (selected && stackSet.has(key)) {
      void stackTo(c)
      return
    }
    if (selected && legalSet.has(key)) {
      void moveTo(c)
      return
    }
    if (selected && sameCoord(selected, c)) {
      clearSelection()
      return
    }
    selectSquare(c)
  }

  return (
    <div
      // touch-action: manipulation kills the ~300ms tap delay and double-tap-zoom on the board
      // squares — there's no drag gesture here to protect, so `none` isn't needed.
      // Below md the board fills its parent (PlayScreen stretches that parent to the screen
      // edges, since a portrait phone's width is what limits the board's size) with square corners
      // meeting the screen edge. From md up it keeps its capped, centered, rounded look.
      className="relative mx-auto w-full select-none bg-board-frame p-[0.9%] shadow-xl ring-1 ring-border touch-manipulation md:w-[min(92vw,880px)] md:rounded-lg"
      style={{ aspectRatio: `${COLS} / ${ROWS}` }}
    >
      {/* click / backdrop layer */}
      <div
        className="grid h-full w-full overflow-hidden rounded"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const c: Coord = { row: Math.floor(i / COLS), col: i % COLS }
          const owner = squareOwner(c)
          const key = coordKey(c)
          const isLegal = legalSet.has(key)
          const isStackTarget = stackSet.has(key)
          const isUnstackTarget = unstackArmed && unstackSet.has(key)
          const isSelected = selected != null && sameCoord(selected, c)
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSquare(c)}
              className={[
                'flex items-center justify-center border border-square-line/40',
                owner === 'P1'
                  ? 'bg-square-p1'
                  : owner === 'P2'
                    ? 'bg-square-p2'
                    : 'bg-square',
                isSelected ? 'ring-2 ring-inset ring-select' : '',
                isStackTarget ? 'ring-2 ring-inset ring-select-strong' : '',
              ].join(' ')}
            >
              {isLegal && (
                <span className="pointer-events-none block h-[26%] w-[26%] rounded-full bg-legal/80" />
              )}
              {isUnstackTarget && (
                <span className="pointer-events-none block h-[26%] w-[26%] rounded-full bg-unstack/80" />
              )}
            </button>
          )
        })}
      </div>

      {/* piece layer */}
      <div className="pointer-events-none absolute inset-[0.9%]">
        <div className="relative h-full w-full">
          {board.pieces.map((p) => (
            <PieceOnBoard key={p.id} piece={p} dying={dying.includes(p.id)} />
          ))}
        </div>
      </div>

      {/* laser layer */}
      <div className="pointer-events-none absolute inset-[0.9%]">
        <LaserLayer />
      </div>

      {/* the game-ending beat: plays once, over everything else, while `keepDown` is set */}
      {keepDown && (
        <div className="pointer-events-none absolute inset-[0.9%] overflow-hidden rounded">
          <KeepDownEffect at={keepDown} />
        </div>
      )}

      {/* rotation controls, floating over the selected piece */}
      {showRotation && selected && (
        <div className="pointer-events-none absolute inset-[0.9%]">
          <div className="relative h-full w-full">
            <RotationOverlay
              at={selected}
              onRotate={(dir) => void rotateSelected(dir)}
              disabled={busy}
              single={selectedPiece?.kind === 'Heliostat'}
            />
          </div>
        </div>
      )}

      {/* unstack toggle, floating over a selected two-high Bastion */}
      {showStackOverlay && selected && (
        <div className="pointer-events-none absolute inset-[0.9%]">
          <div className="relative h-full w-full">
            <StackOverlay
              at={selected}
              armed={unstackArmed}
              disabled={busy}
              onToggle={toggleUnstackArmed}
            />
          </div>
        </div>
      )}
    </div>
  )
}
