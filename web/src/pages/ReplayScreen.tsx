import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, getGame, getGameMoves } from '../api/client'
import type { GameHistoryResponse, GameResponse, MoveHistoryItem } from '../api/types'
import { Logo } from '../components/Logo'
import { ReplayBoard } from '../components/ReplayBoard'
import { identify } from '../game/board'

const RULESET_LABELS: Record<string, string> = { Classic: 'Classic', Khet2: 'Khet 2.0' }
const DEFAULT_LAYOUTS = new Set(['Classic', 'Khet2Classic'])

function gameLabel(game: GameResponse): string {
  const rulesetLabel = RULESET_LABELS[game.ruleset] ?? game.ruleset
  return DEFAULT_LAYOUTS.has(game.layout) ? rulesetLabel : `${rulesetLabel} · ${game.layout}`
}

function describeMove(m: MoveHistoryItem): string {
  const who = m.player === 'P1' ? 'Silver' : 'Red'
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
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 flex items-center justify-between">
          <Logo withWordmark size="sm" />
          <button
            type="button"
            onClick={() => navigate('/archive')}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            Back to archive
          </button>
        </header>

        {error && (
          <div className="mb-3 rounded bg-rose-900/60 px-3 py-2 text-sm text-rose-100">
            Couldn't load this game: {error}
          </div>
        )}

        {!error && (!game || !moves) && <p className="text-slate-400">Loading…</p>}

        {game && moves && (
          <>
            <p className="mb-3 text-sm font-medium">
              {gameLabel(game)} · spectating
              {game.status !== 'InProgress' &&
                ` · ${game.status === 'P1Win' ? 'Silver (P1) won' : 'Red (P2) won'}`}
            </p>

            {board && <ReplayBoard board={board} />}

            <div className="mt-4 flex items-center justify-center gap-2">
              <ReplayButton onClick={() => setStep(0)} disabled={step === 0} label="First">
                «
              </ReplayButton>
              <ReplayButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} label="Previous">
                ‹
              </ReplayButton>
              <span className="w-28 text-center text-sm tabular-nums text-slate-300">
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

            <p className="mt-3 text-center text-sm text-slate-400">
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
      className="rounded bg-slate-700 px-3 py-1.5 text-lg leading-none hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700"
    >
      {children}
    </button>
  )
}
