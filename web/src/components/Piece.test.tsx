import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PieceKind, Player } from '../api/types'
import type { IdentifiedPiece } from '../game/board'
import { Piece } from './Piece'

function piece(kind: PieceKind, owner: Player, health: number | null = null): IdentifiedPiece {
  return { row: 0, col: 0, kind, owner, orientation: null, health, id: `${owner}-${kind}` }
}

const ALL_KINDS: PieceKind[] = ['Mirror', 'Swivel', 'Bastion', 'Keep', 'Heliostat', 'Sentinel']
// Kinds whose silhouette carries a reflective face drawn in --color-mirror.
const MIRROR_KINDS: PieceKind[] = ['Mirror', 'Swivel', 'Heliostat', 'Sentinel']

const MIRROR_VAR = 'var(--color-mirror)'

describe('Piece', () => {
  it.each(ALL_KINDS)('%s renders an <svg> with drawn shape elements', (kind) => {
    const { container } = render(<Piece piece={piece(kind, 'P1')} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelectorAll('polygon, rect, circle, line').length ?? 0).toBeGreaterThan(0)
  })

  it.each(MIRROR_KINDS)('%s draws a --color-mirror face', (kind) => {
    const { container } = render(<Piece piece={piece(kind, 'P1')} />)
    const html = container.innerHTML
    expect(html).toContain(MIRROR_VAR)
  })

  it.each(['Bastion', 'Keep'] as PieceKind[])('%s draws no --color-mirror face', (kind) => {
    const { container } = render(<Piece piece={piece(kind, 'P1')} />)
    expect(container.innerHTML).not.toContain(MIRROR_VAR)
  })

  it.each(ALL_KINDS)('%s renders P1 and P2 with different owner paint', (kind) => {
    const p1 = render(<Piece piece={piece(kind, 'P1')} />).container.innerHTML
    const p2 = render(<Piece piece={piece(kind, 'P2')} />).container.innerHTML
    expect(p1).toContain('var(--color-piece-p1)')
    expect(p2).toContain('var(--color-piece-p2)')
    expect(p1).not.toEqual(p2)
  })

  it('draws the stacked Bastion variant differently from a single Bastion', () => {
    const single = render(<Piece piece={piece('Bastion', 'P1', 1)} />).container.innerHTML
    const stacked = render(<Piece piece={piece('Bastion', 'P1', 2)} />).container.innerHTML
    expect(single).not.toEqual(stacked)
  })

  it('draws the Keep as a tower, without the old crowned head-disc', () => {
    const { container } = render(<Piece piece={piece('Keep', 'P1')} />)
    expect(container.querySelector('circle')).toBeNull()
    expect(container.querySelector('polygon')).toBeNull()
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3)
  })
})
