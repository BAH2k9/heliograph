import type { ComponentPropsWithoutRef } from 'react'
import { cn } from './cn'

type Variant = 'neutral' | 'accent' | 'success' | 'danger' | 'warning'

const VARIANT: Record<Variant, string> = {
  neutral: 'bg-white/5 text-text-muted ring-1 ring-border',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
}

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: ComponentPropsWithoutRef<'span'> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  )
}
