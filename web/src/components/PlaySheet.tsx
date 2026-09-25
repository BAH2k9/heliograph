import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { BotIcon, HostIcon, PlayIcon } from './Sidebar'

/**
 * The phone's "start a game" chooser: a bottom sheet listing the same three ways to play as the
 * desktop `Sidebar`, opened from `MobileTabBar`'s Play tab and from the landing page's Play
 * button. It sits at the bottom of the screen where a thumb already is. The desktop rail stays
 * the entry point at `md+`.
 *
 * While a game is under way the three options are disabled, the same as the sidebar's (resigning
 * is the only way out of a game). The sheet then leads with a way back to that game, unless
 * you're already on its board.
 */
export function PlaySheet({
  open,
  onOpenChange,
  seated,
  onPlayRoute,
  onLocalPlay,
  onPlayBot,
  onHostGame,
  onReturnToGame,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seated: boolean
  onPlayRoute: boolean
  onLocalPlay: () => void
  onPlayBot: () => void
  onHostGame: () => void
  onReturnToGame: () => void
}) {
  const close = (fn: () => void) => () => {
    onOpenChange(false)
    fn()
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-surface-raised pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-3 shadow-xl focus:outline-none"
        >
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
          <RadixDialog.Title className="mb-3 text-base font-semibold text-text">Play</RadixDialog.Title>

          {seated && !onPlayRoute && (
            <Button className="mb-3 w-full" onClick={close(onReturnToGame)}>
              Return to your game
            </Button>
          )}

          <div className="flex flex-col gap-2">
            <PlayOption
              label="Local Play"
              detail="Two players, one device"
              disabled={seated}
              onClick={close(onLocalPlay)}
            >
              <PlayIcon />
            </PlayOption>
            <PlayOption label="Play Bot" detail="Against the computer" disabled={seated} onClick={close(onPlayBot)}>
              <BotIcon />
            </PlayOption>
            <PlayOption
              label="Challenge a Friend"
              detail="Invite someone to an online game"
              disabled={seated}
              onClick={close(onHostGame)}
            >
              <HostIcon />
            </PlayOption>
          </div>

          {seated && (
            <p className="mt-3 text-center text-xs text-text-subtle">
              Resign your current game to start a new one.
            </p>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

function PlayOption({
  label,
  detail,
  disabled,
  onClick,
  children,
}: {
  label: string
  detail: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex min-h-14 items-center gap-4 rounded-lg bg-surface-sunken px-4 py-3 text-left transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:hover:bg-surface-sunken"
    >
      <span className="h-6 w-6 shrink-0 text-accent">{children}</span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="text-xs text-text-muted">{detail}</span>
      </span>
    </button>
  )
}
