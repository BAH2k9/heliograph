import { ApiError, readError } from './client'
import { authFetch } from './authFetch'

/**
 * `POST /api/games/{id}/bug-reports` — files a diagnostic bundle for `id` (the plan's wire
 * contract, `backlog/10-bug-traceability.md`). Own file, matching `adminClient.ts`'s precedent of a
 * distinct, low-frequency action getting its own module rather than folding into `client.ts`.
 * `body` is intentionally untyped here (`unknown`) — the request's `Bundle` field is opaque JSON
 * on the server too (see the plan's Owner decisions), so there's no shared Contracts shape to
 * import.
 */
export interface BugReportBody {
  seat: string | null
  connectionId: string | null
  moveCount: number
  turn: string | null
  status: string | null
  serverOffsetMs: number | null
  lastTraceId: string | null
  clientCapturedAtUtc: string
  bundle: unknown
}

export interface BugReportAck {
  id: string
  receivedAtUtc: string
}

export async function reportBug(gameId: string, body: BugReportBody): Promise<BugReportAck> {
  const res = await authFetch(`/api/games/${encodeURIComponent(gameId)}/bug-reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return (await res.json()) as BugReportAck
}
