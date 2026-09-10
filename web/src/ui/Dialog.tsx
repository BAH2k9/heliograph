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
  description,
  size = 'sm',
  showClose = true,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof RadixDialog.Content>, 'title'> & {
  title: ReactNode
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
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
          'rounded-lg bg-surface-raised p-5 text-text shadow-xl ring-1 ring-border',
          'focus:outline-none',
          SIZE[size],
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
          {showClose && (
            <RadixDialog.Close
              aria-label="Close"
              className="-m-1 rounded p-1 text-text-muted transition-colors hover:bg-white/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </RadixDialog.Close>
          )}
        </div>
        {description != null && (
          <RadixDialog.Description className="-mt-2 mb-4 text-sm text-text-muted">
            {description}
          </RadixDialog.Description>
        )}
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />
}
