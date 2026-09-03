import type { Coord } from '../api/types'
import { COLS, ROWS, coordKey, orientationDeg, sameCoord } from '../game/coords'
import { squareOwner } from '../game/rules'
import { useGame } from '../store'
import { LaserLayer } from './LaserLayer'
import { Piece } from './Piece'

export function Board() {
  const board = useGame((s) => s.board)
  const selected = useGame((s) => s.selected)
  const legalTargets = useGame((s) => s.legalTargets)
  const busy = useGame((s) => s.busy)
  const selectSquare = useGame((s) => s.selectSquare)
  const moveTo = useGame((s) => s.moveTo)
  const clearSelection = useGame((s) => s.clearSelection)

  if (!board) return null

  const legalSet = new Set(legalTargets.map(coordKey))

  function handleSquare(c: Coord) {
    if (busy) return
    if (selected && legalSet.has(coordKey(c))) {
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
          const isLegal = legalSet.has(coordKey(c))
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
              ].join(' ')}
            >
              {isLegal && (
                <span className="pointer-events-none block h-[26%] w-[26%] rounded-full bg-emerald-500/70" />
              )}
            </button>
          )
        })}
      </div>

      {/* piece layer */}
      <div className="pointer-events-none absolute inset-[0.9%]">
        <div className="relative h-full w-full">
          {board.pieces.map((p) => (
            <div
              key={p.id}
              className="absolute left-0 top-0 transition-transform duration-200 ease-out"
              style={{
                width: `${100 / COLS}%`,
                height: `${100 / ROWS}%`,
                transform: `translate(${p.col * 100}%, ${p.row * 100}%) rotate(${
                  p.orientation ? orientationDeg(p.orientation) : 0
                }deg)`,
              }}
            >
              <div className="flex h-full w-full items-center justify-center p-[10%]">
                <Piece piece={p} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* laser layer */}
      <div className="pointer-events-none absolute inset-[0.9%]">
        <LaserLayer />
      </div>
    </div>
  )
}
