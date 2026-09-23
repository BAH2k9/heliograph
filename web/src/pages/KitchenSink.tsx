import { useState } from 'react'
import type { ReactNode } from 'react'
import type { BoardState, Orientation, PieceKind, Player } from '../api/types'
import { HeroDemoBoard } from '../components/HeroDemoBoard'
import { Piece } from '../components/Piece'
import { ReplayBoard } from '../components/ReplayBoard'
import type { IdentifiedPiece } from '../game/board'
import { identify } from '../game/board'
import { orientationDeg } from '../game/coords'
import { PIECE_NAMES } from '../game/displayNames'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { Panel } from '../ui/Panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'

/**
 * DEV-only visual index of the `ui/` primitive layer and the store-free board renderers.
 * Mounted at `/kitchen-sink` only when `import.meta.env.DEV` (see `App.tsx`). Not routed,
 * linked, or bundled in production. The review surface for the design-system work.
 */
export function KitchenSink() {
  return (
    <div className="min-h-screen bg-surface px-6 py-10 text-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <header>
          <h1 className="font-display text-2xl">Kitchen sink</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every primitive in <code>src/ui/</code>, plus the store-free board renderers.
          </p>
        </header>

        <Section title="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Badge">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>neutral</Badge>
            <Badge variant="accent">accent</Badge>
            <Badge variant="success">+12 win</Badge>
            <Badge variant="danger">resigned</Badge>
            <Badge variant="warning">your turn</Badge>
          </div>
        </Section>

        <Section title="Panel">
          <Panel className="p-4 text-sm text-text-muted">
            A raised surface container — the default box for grouped content.
          </Panel>
        </Section>

        <Section title="Field">
          <div className="grid max-w-sm gap-4">
            <Field label="Display name" defaultValue="Bailey" />
            <Field label="Email" type="email" hint="We never share it." />
            <Field label="Room code" defaultValue="XY" error="That room is full." />
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="blitz">
            <TabsList>
              <TabsTrigger value="bullet">Bullet</TabsTrigger>
              <TabsTrigger value="blitz">Blitz</TabsTrigger>
              <TabsTrigger value="rapid">Rapid</TabsTrigger>
            </TabsList>
            <TabsContent value="bullet" className="text-sm text-text-muted">
              1+0, 2+1
            </TabsContent>
            <TabsContent value="blitz" className="text-sm text-text-muted">
              3+0, 3+2, 5+0
            </TabsContent>
            <TabsContent value="rapid" className="text-sm text-text-muted">
              10+0, 10+5, 15+10
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Dialog">
          <DialogDemo />
        </Section>

        <Section title="Pieces — every kind, both owners (NW base orientation)">
          <div className="flex flex-wrap gap-6">
            {PIECE_SPECS.map(({ label, kind, health }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="flex gap-2 rounded-lg bg-square p-2">
                  <PieceTile piece={makePiece(kind, 'P1', null, health)} />
                  <PieceTile piece={makePiece(kind, 'P2', null, health)} />
                </div>
                <span className="text-xs text-text-subtle">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Pieces — a mirror piece in all four orientations">
          <div className="flex flex-wrap gap-6">
            {(['NW', 'NE', 'SE', 'SW'] as Orientation[]).map((o) => (
              <div key={o} className="flex flex-col items-center gap-2">
                <div className="rounded-lg bg-square p-2">
                  <PieceTile piece={makePiece('Pyramid', 'P1', o, null)} orientation={o} />
                </div>
                <span className="text-xs text-text-subtle">{o}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Pieces — board highlight states">
          <HighlightBoard />
        </Section>

        <Section title="Board — static snapshot (ReplayBoard)">
          <ReplayBoard board={identify(SAMPLE_BOARD)} />
        </Section>

        <Section title="Board — decorative laser loop (HeroDemoBoard)">
          <HeroDemoBoard />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</h2>
      {children}
    </section>
  )
}

function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Open dialog</Button>
      </DialogTrigger>
      <DialogContent title="New game" description="Local play stays clockless.">
        <div className="grid gap-4">
          <Field label="Display name" defaultValue="Bailey" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={() => setOpen(false)}>Start</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const PIECE_SPECS: { label: string; kind: PieceKind; health: number | null }[] = (
  [
    ['Pyramid', null],
    ['Djed', null],
    ['Obelisk', null],
    ['Obelisk', 2],
    ['Pharaoh', null],
    ['Sphinx', null],
    ['Anubis', null],
  ] as const
).map(([kind, health]) => ({
  label: health === 2 ? `${PIECE_NAMES[kind]} ×2` : PIECE_NAMES[kind],
  kind,
  health,
}))

let sinkId = 0
function makePiece(
  kind: PieceKind,
  owner: Player,
  orientation: Orientation | null,
  health: number | null,
): IdentifiedPiece {
  sinkId += 1
  return { row: 0, col: 0, kind, owner, orientation, health, id: `sink-${sinkId}` }
}

/** `Piece` fills its box and never rotates itself — the caller sizes it and applies the turn. */
function PieceTile({
  piece,
  orientation,
}: {
  piece: IdentifiedPiece
  orientation?: Orientation
}) {
  return (
    <div
      className="h-16 w-16"
      style={orientation ? { transform: `rotate(${orientationDeg(orientation)}deg)` } : undefined}
    >
      <Piece piece={piece} />
    </div>
  )
}

/** A 4×4 grid reusing Board.tsx's exact highlight class strings, store-free. */
function HighlightBoard() {
  const cells = [
    { key: 'select', ring: 'ring-2 ring-inset ring-select', dot: null, label: 'selection' },
    { key: 'legal', ring: '', dot: 'bg-legal/80', label: 'legal target' },
    {
      key: 'stack',
      ring: 'ring-2 ring-inset ring-select-strong',
      dot: null,
      label: 'stack target',
    },
    { key: 'unstack', ring: '', dot: 'bg-unstack/80', label: 'unstack target' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="grid w-40 grid-cols-4 overflow-hidden rounded ring-1 ring-border">
        {Array.from({ length: 16 }, (_, i) => {
          const marker = cells[i]
          return (
            <div
              key={i}
              className={[
                'flex aspect-square items-center justify-center border border-square-line/40 bg-square',
                marker?.ring ?? '',
              ].join(' ')}
            >
              {marker?.dot && (
                <span className={`block h-[26%] w-[26%] rounded-full ${marker.dot}`} />
              )}
            </div>
          )
        })}
      </div>
      <ul className="text-xs text-text-subtle">
        {cells.map((c) => (
          <li key={c.key}>{c.label}</li>
        ))}
      </ul>
    </div>
  )
}

const SAMPLE_BOARD: BoardState = {
  rows: 8,
  cols: 10,
  pieces: [
    { row: 0, col: 0, kind: 'Sphinx', owner: 'P1', orientation: 'SE', health: null },
    { row: 0, col: 4, kind: 'Anubis', owner: 'P1', orientation: 'SE', health: null },
    { row: 0, col: 5, kind: 'Pharaoh', owner: 'P1', orientation: null, health: null },
    { row: 1, col: 2, kind: 'Pyramid', owner: 'P1', orientation: 'SE', health: null },
    { row: 3, col: 4, kind: 'Djed', owner: 'P1', orientation: 'NE', health: null },
    { row: 3, col: 5, kind: 'Djed', owner: 'P2', orientation: 'NW', health: null },
    { row: 4, col: 6, kind: 'Obelisk', owner: 'P2', orientation: null, health: 2 },
    { row: 6, col: 7, kind: 'Pyramid', owner: 'P2', orientation: 'NW', health: null },
    { row: 7, col: 4, kind: 'Pharaoh', owner: 'P2', orientation: null, health: null },
    { row: 7, col: 5, kind: 'Anubis', owner: 'P2', orientation: 'NW', health: null },
    { row: 7, col: 9, kind: 'Sphinx', owner: 'P2', orientation: 'NW', health: null },
  ],
}
