import * as RadixTabs from '@radix-ui/react-tabs'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from './cn'

/** Underline tabs over Radix Tabs — keyboard nav and roving focus come from Radix. */
export const Tabs = RadixTabs.Root

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn('flex gap-1 border-b border-border', className)} {...props} />
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'px-3 pb-2 text-sm font-medium text-text-muted transition-colors',
        'hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'data-[state=active]:-mb-px data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-text',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn('mt-4 focus-visible:outline-none', className)}
      {...props}
    />
  )
}
