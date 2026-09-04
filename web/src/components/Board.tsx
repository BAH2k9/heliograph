import type { Coord } from '../api/types'
import { pieceAt } from '../game/board'
import { COLS, ROWS, coordKey, sameCoord } from '../game/coords'
import { canRotate, squareOwner } from '../game/rules'
import { useGame } from '../store'
import { LaserLayer } from './LaserLayer'
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
    selectedPiece.kind === 'Obelisk' &&
    (selectedPiece.health ?? 1) === 2 &&
    unstackTargets.length > 0

  const legalSet = new Set(legalTargets.map(coordKey))
  const stackSet = new Set(stackTargets.map(coordKey))
  const unstackSet = new Set(unstackTargets.map(coordKey))

  function handleSquare(c: Coord) {
    if (busy) return
    const key = coordKey(c)
    // Stack targets are occupied friendly-obelisk squares (never legal move targets, so this
    // never shadows a Djed swap); unstack targets only act while armed via the StackOverlay.
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
      className="relative mx-auto select-none rounded-lg bg-slate-800 p-[0.9%] shadow-xl"
      style={{ width: 'min(92vw, 880px)', aspectRatio: `${COLS} / ${ROWS}` }}
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
                'flex items-center justify-center border border-slate-700/50',
                owner === 'P1'
                  ? 'bg-slate-300'
                  : owner === 'P2'
                    ? 'bg-rose-200'
                    : 'bg-slate-100',
                isSelected ? 'ring-2 ring-inset ring-amber-400' : '',
                isStackTarget ? 'ring-2 ring-inset ring-amber-500' : '',
              ].join(' ')}
            >
              {isLegal && (
                <span className="pointer-events-none block h-[26%] w-[26%] rounded-full bg-emerald-500/70" />
              )}
              {isUnstackTarget && (
                <span className="pointer-events-none block h-[26%] w-[26%] rounded-full bg-sky-500/70" />
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

      {/* rotation controls, floating over the selected piece */}
      {showRotation && selected && (
        <div className="pointer-events-none absolute inset-[0.9%]">
          <div className="relative h-full w-full">
            <RotationOverlay
              at={selected}
              onRotate={(dir) => void rotateSelected(dir)}
              disabled={busy}
              single={selectedPiece?.kind === 'Sphinx'}
            />
          </div>
        </div>
      )}

      {/* unstack toggle, floating over a selected two-high obelisk */}
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
