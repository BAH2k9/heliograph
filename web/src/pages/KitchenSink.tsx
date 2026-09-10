import { useState } from 'react'
import type { ReactNode } from 'react'
import type { BoardState } from '../api/types'
import { HeroDemoBoard } from '../components/HeroDemoBoard'
import { ReplayBoard } from '../components/ReplayBoard'
import { identify } from '../game/board'
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
