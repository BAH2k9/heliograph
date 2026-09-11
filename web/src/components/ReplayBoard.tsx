import type { ClientBoard } from '../game/board'
import { COLS, ROWS } from '../game/coords'
import { squareOwner } from '../game/rules'
import { PieceOnBoard } from './PieceOnBoard'

/** A read-only snapshot of a board — no click handling, no selection, no live beam. */
export function ReplayBoard({ board }: { board: ClientBoard }) {
  return (
    <div
      className="relative mx-auto select-none rounded-lg bg-board-frame p-[0.9%] shadow-xl ring-1 ring-border"
      style={{ width: 'min(92vw, 880px)', aspectRatio: `${COLS} / ${ROWS}` }}
    >
      <div
        className="grid h-full w-full overflow-hidden rounded"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const owner = squareOwner({ row: Math.floor(i / COLS), col: i % COLS })
          return (
            <div
              key={i}
              className={[
                'border border-square-line/40',
                owner === 'P1' ? 'bg-square-p1' : owner === 'P2' ? 'bg-square-p2' : 'bg-square',
              ].join(' ')}
            />
          )
        })}
      </div>

      <div className="pointer-events-none absolute inset-[0.9%]">
        <div className="relative h-full w-full">
          {board.pieces.map((p) => (
            <PieceOnBoard key={p.id} piece={p} dying={false} />
          ))}
        </div>
      </div>
    </div>
  )
}
