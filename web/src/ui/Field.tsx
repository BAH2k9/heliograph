import { useId } from 'react'
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'
import { cn } from './cn'

/** Label + input + optional hint / error, wired together with a generated id. */
export function Field({
  label,
  hint,
  error,
  id,
  className,
  inputClassName,
  ref,
  ...props
}: ComponentPropsWithoutRef<'input'> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  inputClassName?: string
  ref?: Ref<HTMLInputElement>
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <input
        id={fieldId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-md bg-surface-sunken px-3 py-2 text-text outline-none ring-1 ring-border',
          'focus:ring-2 focus:ring-accent',
          error && 'ring-danger focus:ring-danger',
          inputClassName,
        )}
        {...props}
      />
      {hint != null && !error && <p className="text-xs text-text-subtle">{hint}</p>}
      {error != null && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
