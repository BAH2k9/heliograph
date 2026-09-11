import type { ComponentPropsWithoutRef } from 'react'
import { cn } from './cn'

/** A raised surface container — the default box for grouped content. */
export function Panel({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('rounded-lg bg-surface-raised ring-1 ring-border', className)}
      {...props}
    />
  )
}
