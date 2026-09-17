/**
 * Client-side ring buffer of recent events — the other half of the "correlation id" story in
 * `backlog/10-bug-traceability.md`. `authFetch`, `realtime.ts` and `store.ts` push one entry per
 * REST attempt / hub event / disputed-state-path action; `BugReportDialog` snapshots the buffer
 * (`getRingBuffer()`) into the bundle it POSTs to `/api/games/{id}/bug-reports`.
 *
 * **Dependency-free by design**: this file imports nothing from the app (no `store.ts`,
 * `realtime.ts`, `authFetch.ts`) since all three of those import *into* it — an import the other
 * way would create a cycle.
 */

export type RingEntryKind = 'action' | 'hub' | 'rest'

export interface RingEntry {
  kind: RingEntryKind
  label: string
  timestamp: number
  detail?: unknown
}

export const RING_SIZE = 200

let buffer: RingEntry[] = []

/** Appends one entry, evicting the oldest once the buffer is at `RING_SIZE`. */
export function pushRingEntry(entry: Omit<RingEntry, 'timestamp'> & { timestamp?: number }): void {
  buffer.push({ timestamp: Date.now(), ...entry })
  if (buffer.length > RING_SIZE) buffer.splice(0, buffer.length - RING_SIZE)
}

/** A snapshot copy — never the live array, so a caller can't mutate the buffer out from under
 *  future pushes. */
export function getRingBuffer(): RingEntry[] {
  return [...buffer]
}

/** Test-only: clears the buffer between test cases. */
export function resetRingBuffer(): void {
  buffer = []
}

/**
 * `crypto.randomUUID()` is only exposed in a secure context (HTTPS or `localhost`) — it's
 * `undefined` when the app is served over plain HTTP, e.g. a LAN IP during playtesting. This is a
 * diagnostic correlation id, not a security token, so a non-cryptographic fallback is fine.
 */
export function randomTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
