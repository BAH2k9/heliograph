import type { PieceKind, Player } from '../api/types'

// Player-facing names for the wire enums. The enum values themselves (`'Keep'`, `'P1'`, …) are
// the server's identifiers and are sent verbatim; the UI never shows them. Any label that names a
// piece or a side goes through these maps instead, so the display vocabulary lives in one place.

/** What each piece is called on screen. */
export const PIECE_NAMES: Record<PieceKind, string> = {
  Mirror: 'Mirror',
  Swivel: 'Swivel',
  Bastion: 'Bastion',
  Keep: 'Keep',
  Heliostat: 'Heliostat',
  Sentinel: 'Sentinel',
}

/** What each side is called on screen. P1 moves first. The seat id itself is never shown. */
export const SIDE_NAMES: Record<Player, string> = {
  P1: 'Brass',
  P2: 'Cobalt',
}

/** Who a finished game's `status` says won — its side's name, e.g. `"Brass"`. */
export function winnerSideName(status: 'P1Win' | 'P2Win'): string {
  return SIDE_NAMES[status === 'P1Win' ? 'P1' : 'P2']
}
