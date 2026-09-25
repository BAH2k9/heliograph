import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, getGame, getGameMoves } from '../api/client'
import type { GameHistoryResponse, GameResponse, MoveHistoryItem } from '../api/types'
import { SIDE_NAMES, sideLabel } from '../game/displayNames'
import { DEFAULT_LAYOUT, rulesetLabel } from '../game/gamePresets'
import { Logo } from '../components/Logo'
import { ReplayBoard } from '../components/ReplayBoard'
import { Button } from '../ui/Button'
import { identify } from '../game/board'

function gameLabel(game: GameResponse): string {
  const label = rulesetLabel(game.ruleset)
  return game.layout === DEFAULT_LAYOUT ? label : `${label} · ${game.layout}`
}

function describeMove(m: MoveHistoryItem): string {
  const who = SIDE_NAMES[m.player]
  const at = (c: { row: number; col: number }) => `(${c.row + 1}, ${c.col + 1})`
  switch (m.type) {
    case 'Move':
      return `${who} moved ${at(m.from)} → ${at(m.to!)}`
    case 'Rotate':
      return `${who} rotated ${at(m.from)} ${m.rotation}`
    case 'Stack':
      return `${who} stacked ${at(m.from)} onto ${at(m.to!)}`
    case 'Unstack':
      return `${who} split ${at(m.from)} onto ${at(m.to!)}`
  }
}

/**
 * A read-only, chess.com-style move-by-move replay of a finished or in-progress game.
 * `step` is 0 (starting position) through `moves.length` (the latest move played).
 */
export function ReplayScreen() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()

  const [game, setGame] = useState<GameResponse | null>(null)
  const [history, setHistory] = useState<GameHistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    Promise.all([getGame(gameId), getGameMoves(gameId)])
      .then(([g, h]) => {
        if (cancelled) return
        setGame(g)
        setHistory(h)
        setStep(h.moves.length)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  const moves = history?.moves ?? null
  const maxStep = moves?.length ?? 0

  const board = useMemo(() => {
    if (!history) return null
    return identify(step === 0 ? history.startingBoardState : history.moves[step - 1].boardState)
  }, [history, step])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
      if (e.key === 'ArrowRight') setStep((s) => Math.min(maxStep, s + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maxStep])

  const current = moves && step > 0 ? moves[step - 1] : null

  return (
    <div className="flex-1 bg-surface px-4 py-6 text-text sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 flex items-center justify-between">
          {/* Below md, MobileNav's sticky top bar already carries the wordmark. */}
          <div className="hidden md:block">
            <Logo withWordmark size="sm" />
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/archive')}>
            Back to archive
          </Button>
        </header>

        {error && (
          <div className="mb-3 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
            Couldn't load this game: {error}
          </div>
        )}

        {!error && (!game || !moves) && <p className="text-text-muted">Loading…</p>}

        {game && moves && (
          <>
            <p className="mb-3 text-sm font-medium">
              {gameLabel(game)} · spectating
              {game.status !== 'InProgress' &&
                ` · ${sideLabel(game.status === 'P1Win' ? 'P1' : 'P2')} won`}
            </p>

            {board && (
              // Edge to edge on phones, same as PlayScreen: cancel this page's px-4 / sm:px-6.
              <div className="-mx-4 sm:-mx-6 md:mx-0">
                <ReplayBoard board={board} />
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-2">
              <ReplayButton onClick={() => setStep(0)} disabled={step === 0} label="First">
                «
              </ReplayButton>
              <ReplayButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} label="Previous">
                ‹
              </ReplayButton>
              <span className="w-28 text-center text-sm tabular-nums text-text-muted">
                Move {step} / {maxStep}
              </span>
              <ReplayButton
                onClick={() => setStep((s) => Math.min(maxStep, s + 1))}
                disabled={step === maxStep}
                label="Next"
              >
                ›
              </ReplayButton>
              <ReplayButton onClick={() => setStep(maxStep)} disabled={step === maxStep} label="Last">
                »
              </ReplayButton>
            </div>

            <p className="mt-3 text-center text-sm text-text-muted">
              {current ? describeMove(current) : 'Starting position'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function ReplayButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md bg-white/5 px-3 py-1.5 text-lg leading-none text-text transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5"
    >
      {children}
    </button>
  )
}
