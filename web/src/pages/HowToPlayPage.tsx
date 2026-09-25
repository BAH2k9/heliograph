import type { ReactNode } from 'react'
import type { Orientation, PieceKind } from '../api/types'
import { Piece } from '../components/Piece'
import { RuleDiagram } from '../components/RuleDiagram'
import { BotIcon, HostIcon, PlayIcon } from '../components/Sidebar'
import { COLS, ROWS, orientationDeg } from '../game/coords'
import { DEFAULT_LAYOUT, LAYOUTS, RULESETS } from '../game/gamePresets'
import { squareOwner } from '../game/rules'
import { Panel } from '../ui/Panel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'

type RulesetId = (typeof RULESETS)[number]['id']

interface PieceGuide {
  kind: PieceKind
  name: string
  orientation?: Orientation
  health?: number
  text: string
}

// The rules text below is written against `Heliograph.Engine` (GameEngine.cs, LaserReflection.cs),
// not against the `game/` mirror. A rule change there has to move this page too.

const KEEP: PieceGuide = {
  kind: 'Keep',
  name: 'Keep',
  text: "The piece you're protecting. Any hit, from any side and by either player's beam, destroys it and loses you the game. It moves like the rest but can't be rotated.",
}

const MIRROR: PieceGuide = {
  kind: 'Mirror',
  name: 'Mirror',
  orientation: 'NW',
  text: 'Its long pale-blue edge is a mirror: a beam hitting it turns 90°. A hit on either of its two flat sides destroys it.',
}

const SWIVEL: PieceGuide = {
  kind: 'Swivel',
  name: 'Swivel',
  orientation: 'NW',
  text: "Mirrored on both sides, so it always bounces the beam and can't be destroyed. It can also swap places with a neighbouring Mirror, Bastion or Sentinel, yours or your opponent's, instead of moving to an empty square.",
}

const BASTION: PieceGuide = {
  kind: 'Bastion',
  name: 'Bastion',
  health: 2,
  text: "A solid block with no mirror. It stops the beam. Bastions start stacked two high: a hit knocks off the top one, and a second hit destroys what's left. They can't be rotated.",
}

const SENTINEL: PieceGuide = {
  kind: 'Sentinel',
  name: 'Sentinel',
  orientation: 'NW',
  text: 'Stops the beam. A hit on its pale-blue shield does nothing; a hit on any other side destroys it. Turn it so the shield faces the danger.',
}

const HELIOSTAT: PieceGuide = {
  kind: 'Heliostat',
  name: 'Heliostat',
  orientation: 'NW',
  text: "Your beam's source. It stays in your corner, can't be destroyed, and a beam that runs into one just stops.",
}

const PIECES: Record<RulesetId, PieceGuide[]> = {
  FixedSun: [KEEP, MIRROR, SWIVEL, BASTION],
  TurningSun: [KEEP, MIRROR, SWIVEL, SENTINEL, HELIOSTAT],
}

const DEFAULT_LAYOUT_LABEL = LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT)?.label ?? DEFAULT_LAYOUT

const RULESET_GUIDES: Record<RulesetId, () => ReactNode> = {
  FixedSun: FixedSunGuide,
  TurningSun: TurningSunGuide,
}

/**
 * `/how-to-play` — the rules, reached from the landing page's How to play button. The shared
 * rules come first, then one tab per ruleset (driven off `RULESETS`, so a new ruleset without a
 * guide is a type error here), then the three ways to start a game.
 */
export function HowToPlayPage() {
  return (
    <div className="flex-1 bg-surface px-4 py-6 text-text sm:px-10 sm:py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-10">
        <header>
          <h1 className="text-2xl font-semibold">How to play</h1>
          <p className="mt-2 leading-relaxed text-text-muted">
            Heliograph is a two-player game of mirrors and light. Each turn you make one move, then
            your beam fires across the board. Bounce it into your opponent&apos;s Keep to win.
          </p>
        </header>

        <Section title="The basics">
          <Topic title="The goal">
            <p>
              Each side has a Keep. Hit your opponent&apos;s Keep with your beam and you win. The beam
              doesn&apos;t care whose pieces it hits, so it can knock out your own pieces, and your own
              Keep, just as easily.
            </p>
          </Topic>

          <Topic title="Your turn">
            <p>A turn is exactly one action:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>move one of your pieces one square in any direction, diagonals included, or</li>
              <li>rotate one of your pieces a quarter turn, either way.</li>
            </ul>
            <p>
              Fixed Sun also lets you stack and split Bastions, and in Turning Sun rotating your
              Heliostat re-aims your beam; both are covered under Rulesets below. Then your beam fires
              by itself. There&apos;s nothing to aim or trigger: where it goes depends only on where
              the pieces stand.
            </p>
          </Topic>

          <Topic title="The beam">
            <p>
              The beam travels in a straight line from your corner. When it strikes a mirror it turns
              90° and carries on. It stops at the first piece that doesn&apos;t reflect it, and that
              piece is usually destroyed. A beam that runs off the edge of the board does nothing.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <RuleDiagram
                pieces={[{ row: 1, col: 1, kind: 'Mirror', owner: 'P2', orientation: 'NW' }]}
                beam={[
                  { x: 1.5, y: 0 },
                  { x: 1.5, y: 1.5 },
                  { x: 0, y: 1.5 },
                ]}
                caption="A mirror turns the beam."
              />
              <RuleDiagram
                pieces={[{ row: 1, col: 1, kind: 'Mirror', owner: 'P2', orientation: 'NW', destroyed: true }]}
                beam={[
                  { x: 1.5, y: 3 },
                  { x: 1.5, y: 1.5 },
                ]}
                caption="A flat side stops it. The piece is destroyed."
              />
              <RuleDiagram
                pieces={[{ row: 1, col: 1, kind: 'Swivel', owner: 'P2', orientation: 'NW' }]}
                beam={[
                  { x: 1.5, y: 3 },
                  { x: 1.5, y: 1.5 },
                  { x: 3, y: 1.5 },
                ]}
                caption="A Swivel bounces it from any side."
              />
            </div>
          </Topic>

          <Topic title="Sides and reserved squares">
            <p>
              Brass starts at the bottom of the board and Cobalt at the top. The tinted squares are
              reserved: you can never move a piece onto a square tinted in your opponent&apos;s
              colour.
            </p>
            <ReservedSquaresMap />
          </Topic>

          <Topic title="Controls">
            <ul className="list-disc space-y-1 pl-5">
              <li>Tap one of your pieces to pick it up. Dots mark the squares it can move to; tap one to move.</li>
              <li>
                Use the curved arrows beside a picked-up piece to rotate it. On a keyboard, Q turns it
                counter-clockwise and E clockwise.
              </li>
              <li>
                Tap the piece again to put it back. Nothing counts until you move, so you can look
                around freely.
              </li>
            </ul>
          </Topic>
        </Section>

        <Section
          title="Rulesets"
          intro="Every game is played under one of two rulesets, chosen when the game is set up."
        >
          <Tabs defaultValue={RULESETS[0].id}>
            <TabsList>
              {RULESETS.map((r) => (
                <TabsTrigger key={r.id} value={r.id}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {RULESETS.map((r) => {
              const Guide = RULESET_GUIDES[r.id]
              return (
                <TabsContent key={r.id} value={r.id} className="flex flex-col gap-6">
                  <p className="leading-relaxed text-text-muted">{r.blurb}</p>
                  <Guide />
                  <Topic title="Pieces">
                    <ul className="flex flex-col gap-4">
                      {PIECES[r.id].map((p) => (
                        <PieceRow key={p.kind} piece={p} />
                      ))}
                    </ul>
                  </Topic>
                </TabsContent>
              )
            })}
          </Tabs>
          <p className="text-sm leading-relaxed text-text-muted">
            Either ruleset can start from any layout ({LAYOUTS.map((l) => l.label).join(', ')}).
            Each lays the pieces out differently; {DEFAULT_LAYOUT_LABEL} is the default.
          </p>
        </Section>

        <Section title="Ways to play">
          <div className="flex flex-col gap-3">
            <WayToPlay icon={<PlayIcon />} title="Local Play">
              <p>
                Two players share one device and take turns on the same screen. Pick the ruleset and
                layout to start. Local games have no clock and don&apos;t change your rating.
              </p>
            </WayToPlay>
            <WayToPlay icon={<BotIcon />} title="Play Bot">
              <p>
                Play the computer at Easy, Medium or Hard. Easy plays random legal moves, which makes
                it a good way to learn the board. You play Brass. Bot games have no clock and
                don&apos;t change your rating.
              </p>
            </WayToPlay>
            <WayToPlay icon={<HostIcon />} title="Challenge a Friend">
              <p>
                Play someone online. Add them on the Friends page first, then send an invite that
                sets the ruleset, layout, clock and whether the game is rated. They get a notification,
                and once they accept you&apos;re both taken to the board.
              </p>
              <p>
                <span className="font-medium text-text">Clocks.</span> Bullet, Blitz and Rapid give
                each side a set number of minutes, sometimes with seconds added after every move: 3+2
                means three minutes, plus two seconds per move. Daily gives you days for each move
                instead. Run out of time and
                you lose.
              </p>
              <p>
                <span className="font-medium text-text">Rated games</span> with a clock move both
                players&apos; ratings for that clock&apos;s category. An untimed game never changes a
                rating.
              </p>
            </WayToPlay>
          </div>
        </Section>

        <Section title="How a game ends">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-muted">
            <li>A beam hits a Keep. Its owner loses, even when it was their own beam.</li>
            <li>A player resigns.</li>
            <li>A player&apos;s clock runs out.</li>
            <li>A player leaves an online game and doesn&apos;t come back within 45 seconds.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}

function FixedSunGuide() {
  return (
    <>
      <Topic title="Your beam">
        <p>
          Each beam fires from a fixed corner: Brass from the bottom-right, straight up the right-hand
          edge, and Cobalt from the top-left, straight down the left-hand edge. No piece can move onto
          either corner.
        </p>
      </Topic>
      <Topic title="Stacking and splitting Bastions">
        <p>
          Bastions start stacked two high. As well as moving a whole stack, you can use your turn to
          reshape it:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-text">Split:</span> pick up a two-high Bastion, tap{' '}
            <span className="font-medium text-text">Split</span>, then tap an empty square next to it.
            One Bastion drops there and the other stays put.
          </li>
          <li>
            <span className="font-medium text-text">Stack:</span> pick up a single Bastion and tap
            another of your single Bastions next to it. They join into a two-high stack.
          </li>
        </ul>
      </Topic>
    </>
  )
}

function TurningSunGuide() {
  return (
    <>
      <Topic title="Your beam">
        <p>
          Your beam comes from your Heliostat, in your corner: Brass bottom-right, Cobalt top-left. It
          fires along one of the two edges that meet there. Spending your turn to rotate it switches
          it to the other edge.
        </p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <RuleDiagram
            pieces={[{ row: 2, col: 2, kind: 'Heliostat', owner: 'P1', orientation: 'NE' }]}
            beam={[
              { x: 2.5, y: 2.5 },
              { x: 2.5, y: 0 },
            ]}
            caption="Brass's Heliostat firing up the right-hand edge…"
          />
          <RuleDiagram
            pieces={[{ row: 2, col: 2, kind: 'Heliostat', owner: 'P1', orientation: 'NW' }]}
            beam={[
              { x: 2.5, y: 2.5 },
              { x: 0, y: 2.5 },
            ]}
            caption="…and rotated to fire along the bottom."
          />
        </div>
      </Topic>
      <Topic title="Sentinels">
        <p>
          Sentinels take the place of Bastions, and nothing stacks in this ruleset. A Sentinel&apos;s
          shield only protects one side, but unlike a Bastion it can be rotated.
        </p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <RuleDiagram
            pieces={[{ row: 1, col: 1, kind: 'Sentinel', owner: 'P2', orientation: 'NW' }]}
            beam={[
              { x: 0, y: 1.5 },
              { x: 1.5, y: 1.5 },
            ]}
            caption="A hit on the shield stops the beam. The Sentinel survives."
          />
          <RuleDiagram
            pieces={[{ row: 1, col: 1, kind: 'Sentinel', owner: 'P2', orientation: 'NW', destroyed: true }]}
            beam={[
              { x: 1.5, y: 0 },
              { x: 1.5, y: 1.5 },
            ]}
            caption="A hit anywhere else destroys it."
          />
        </div>
      </Topic>
    </>
  )
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {intro && <p className="mt-1 text-sm text-text-muted">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-text-muted">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {children}
    </div>
  )
}

function PieceRow({ piece }: { piece: PieceGuide }) {
  return (
    <li className="flex items-start gap-3">
      <div aria-hidden className="h-12 w-12 shrink-0 rounded-md bg-square ring-1 ring-square-line">
        <div
          className="h-full w-full p-[12%]"
          style={{ transform: piece.orientation ? `rotate(${orientationDeg(piece.orientation)}deg)` : undefined }}
        >
          <Piece
            piece={{
              id: piece.kind,
              row: 0,
              col: 0,
              kind: piece.kind,
              owner: 'P1',
              orientation: piece.orientation ?? null,
              health: piece.health ?? null,
            }}
          />
        </div>
      </div>
      <div>
        <p className="font-medium text-text">{piece.name}</p>
        <p>{piece.text}</p>
      </div>
    </li>
  )
}

function WayToPlay({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Panel className="flex gap-4 p-4">
      <span aria-hidden className="h-6 w-6 shrink-0 text-accent">
        {icon}
      </span>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-text-muted">
        <h3 className="font-semibold text-text">{title}</h3>
        {children}
      </div>
    </Panel>
  )
}

/** The full board with only the reserved-square tints drawn — `squareOwner` is the same rule the real board colours by. */
function ReservedSquaresMap() {
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <span className="text-xs font-medium text-side-p2">Cobalt</span>
      <div
        aria-hidden
        className="w-full max-w-sm rounded-md bg-board-frame p-[1.2%] ring-1 ring-border"
        style={{ aspectRatio: `${COLS} / ${ROWS}` }}
      >
        <div
          className="grid h-full w-full overflow-hidden rounded-sm"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
        >
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const owner = squareOwner({ row: Math.floor(i / COLS), col: i % COLS })
            return (
              <div
                key={i}
                className={`border border-square-line/40 ${
                  owner === 'P1' ? 'bg-square-p1' : owner === 'P2' ? 'bg-square-p2' : 'bg-square'
                }`}
              />
            )
          })}
        </div>
      </div>
      <span className="text-xs font-medium text-side-p1">Brass</span>
    </div>
  )
}
