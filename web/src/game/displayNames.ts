import type { PieceKind, Player } from '../api/types'

// Player-facing names for the wire enums. The enum values themselves (`'Pharaoh'`, `'P1'`, …) are
// the server's identifiers and are sent verbatim; the UI never shows them. Any label that names a
// piece or a side goes through these maps instead, so the display vocabulary lives in one place.

/** What each piece is called on screen. */
export const PIECE_NAMES: Record<PieceKind, string> = {
  Pyramid: 'Mirror',
  Djed: 'Swivel',
  Obelisk: 'Bastion',
  Pharaoh: 'Keep',
  Sphinx: 'Heliostat',
  Anubis: 'Sentinel',
}

/** What each side is called on screen. P1 moves first. */
export const SIDE_NAMES: Record<Player, string> = {
  P1: 'Brass',
  P2: 'Cobalt',
}

/** A side's name with its seat, e.g. `"Brass (P1)"`. */
export function sideLabel(player: Player): string {
  return `${SIDE_NAMES[player]} (${player})`
}
