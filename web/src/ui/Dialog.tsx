import * as RadixDialog from '@radix-ui/react-dialog'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from './cn'

/**
 * Styled wrapper over Radix Dialog. Radix owns the hard parts — focus trap, Escape,
 * scroll lock, `aria-modal`, returning focus to the trigger. We own the look.
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent title="New game">…<DialogFooter>…</DialogFooter></DialogContent>
 *   </Dialog>
 *
 * The close button renders last in the DOM (positioned top-right) so Radix's open-focus
 * lands on the first field in `children`, not on "Close".
 */
export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

type Size = 'sm' | 'md' | 'lg'

const SIZE: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function DialogContent({
  title,
  hideTitle = false,
  description,
  size = 'sm',
  showClose = true,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof RadixDialog.Content>, 'title'> & {
  title: ReactNode
  /** Keep the title for screen readers but not on screen (the content is its own header). */
  hideTitle?: boolean
  description?: ReactNode
  size?: Size
  showClose?: boolean
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
      <RadixDialog.Content
        {...(description == null ? { 'aria-describedby': undefined } : null)}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
          'rounded-lg bg-surface-raised p-5 text-text shadow-xl ring-1 ring-border',
          'focus:outline-none',
          SIZE[size],
          className,
        )}
        {...props}
      >
        <RadixDialog.Title className={cn(hideTitle ? 'sr-only' : 'pr-8 text-lg font-semibold')}>
          {title}
        </RadixDialog.Title>
        {description != null && (
          <RadixDialog.Description className={cn(hideTitle ? 'sr-only' : 'mt-1 text-sm text-text-muted')}>
            {description}
          </RadixDialog.Description>
        )}
        <div className={cn(!hideTitle && 'mt-4')}>{children}</div>
        {showClose && (
          <RadixDialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 rounded p-1 text-text-muted transition-colors hover:bg-white/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />
}
