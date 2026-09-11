import { clsx, type ClassValue } from 'clsx'

/** Join conditional class names. Thin wrapper over clsx so call sites import one helper. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
