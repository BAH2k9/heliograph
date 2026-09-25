import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { IdentifiedPiece } from '../game/board'
import { PieceOnBoard } from './PieceOnBoard'

const mirror: IdentifiedPiece = {
  row: 2,
  col: 3,
  kind: 'Mirror',
  owner: 'P1',
  orientation: 'NW',
  health: null,
  id: 'P1-Mirror',
}

describe('PieceOnBoard', () => {
  // Regression guard for docs/bugs/phone-animation-jank.md: Framer Motion moves pieces with
  // per-frame `transform` writes, so an unpromoted piece makes every frame repaint the board
  // under it, which ran at ~2 fps on a weak phone. Each piece needs its own layer up front. jsdom
  // can't measure frame rate; this only stops the promotion from quietly being dropped.
  it.each([false, true])('is promoted to its own compositor layer (dying: %s)', (dying) => {
    const { container } = render(<PieceOnBoard piece={mirror} dying={dying} />)
    expect(container.firstElementChild?.classList.contains('will-change-transform')).toBe(true)
  })
})
