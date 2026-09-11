import { ApiError } from '../../api/client'

/** The repo's standard "turn a caught unknown into a message" unwrap (see `client.ts` call sites). */
export function errText(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e)
}
