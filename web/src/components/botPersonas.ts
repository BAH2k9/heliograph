/**
 * Client-side personas for the bot seat's player-info popup (`backlog/09-player-info-popup.md`) —
 * the server has no identity for a bot seat at all, so this invents one. Themed distinctly from
 * `localPlayerNames.ts`'s film-character pool (AI/robot/laser-flavored rather than pop culture) to
 * keep the two visually distinguishable at a glance. Picked deterministically off the game id
 * (not `Math.random`, unlike the hotseat pool) so the same bot keeps its identity across a reload
 * — a fresh random pick every render/reload would read as a bug, not personality.
 */
export interface BotPersona {
  displayName: string
  bio: string
}

const BOT_PERSONAS: readonly BotPersona[] = [
  { displayName: 'UNIT-7', bio: 'Runs on pure minimax and spite.' },
  { displayName: 'Prism', bio: 'Sees every beam angle before you do.' },
  { displayName: 'Obelisk.exe', bio: 'Deflects criticism as well as lasers.' },
  { displayName: 'Ray-4', bio: 'Named itself after the thing it likes killing you with.' },
  { displayName: 'Circuit Sphinx', bio: 'Asks riddles. Answers none. Wins anyway.' },
  { displayName: 'Vector', bio: 'Calculates seventeen moves ahead, mostly for fun.' },
  { displayName: 'The Mirror', bio: "Reflects your strategy back at you, worse." },
  { displayName: 'Pharaoh-9000', bio: "Its own king piece is the least of your worries." },
  { displayName: 'Beamline', bio: "Doesn't blink. Doesn't have eyes. Doesn't need them." },
  { displayName: 'Static', bio: 'A little unpredictable. A lot dangerous.' },
]

/** FNV-1a-ish string hash — good enough for a stable, well-spread pick, not cryptography. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministically picks one persona per game id — the same bot seat always reads the same
 *  across a reload, since it's derived from the id rather than randomized per render. */
export function botPersonaFor(gameId: string): BotPersona {
  return BOT_PERSONAS[hashString(gameId) % BOT_PERSONAS.length]
}
