import type { ComponentPropsWithoutRef, Ref } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-white/5 text-text ring-1 ring-border hover:bg-white/10 hover:ring-border-strong',
  ghost: 'text-text-muted hover:bg-white/5 hover:text-text',
  danger: 'bg-danger text-danger-fg hover:bg-danger/90',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ref,
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: Variant
  size?: Size
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}
