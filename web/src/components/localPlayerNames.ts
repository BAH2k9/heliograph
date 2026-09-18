import { AVATAR_IDS } from './Avatar'

/**
 * Fictional character names for Local Play's two hotseat "guest" seats — drawn from Game of
 * Thrones, Dune, Star Wars, and Lord of the Rings (movie/TV canon). Local play has no accounts to
 * name the seats after (see `store.ts`'s `newGame`), so this stands in for the "Guest" fallback
 * `PlayerCard` used to show, matching the signed-in card's look via a real `displayName` +
 * `avatarId` instead of null. Mirrors `Avatar.tsx`'s `AVATAR_IDS` as a small fixed-pool module.
 */
export const LOCAL_PLAYER_NAMES = [
  // Game of Thrones
  'Jon Snow',
  'Daenerys',
  'Tyrion',
  'Arya Stark',
  'Cersei',
  'Sandor Clegane',
  'Brienne',
  'Varys',
  // Dune
  'Paul Atreides',
  'Chani',
  'Duncan Idaho',
  'Lady Jessica',
  'Stilgar',
  'Gurney Halleck',
  'Leto Atreides',
  'Liet-Kynes',
  // Star Wars
  'Luke Skywalker',
  'Leia Organa',
  'Han Solo',
  'Obi-Wan',
  'Ahsoka Tano',
  'Darth Vader',
  'Mace Windu',
  'Boba Fett',
  // Lord of the Rings
  'Frodo Baggins',
  'Aragorn',
  'Gandalf',
  'Legolas',
  'Gimli',
  'Éowyn',
  'Samwise',
  'Boromir',
] as const

/** One seat's synthesized identity for Local Play. */
export interface LocalPlayerIdentity {
  displayName: string
  avatarId: string
}

/**
 * Short in-universe one-liners, keyed by `displayName` — the hotseat character popup's bio
 * (`backlog/09-player-info-popup.md`). Looked up by `bioFor`, not returned from
 * `pickLocalPlayerIdentities`, so the identity shape store.ts already persists is untouched.
 */
const LOCAL_PLAYER_BIOS: Record<(typeof LOCAL_PLAYER_NAMES)[number], string> = {
  // Game of Thrones
  'Jon Snow': "Knows nothing, wins anyway. Currently trying not to die a second time.",
  Daenerys: 'Breaker of chains, collector of dragons. Not a fan of losing.',
  Tyrion: "Drinks and knows things — mostly about laser geometry, tonight.",
  'Arya Stark': 'Has a list. Your Pharaoh is not on it, but it can be arranged.',
  Cersei: 'Plays the game of chairs. This board is a nice change of pace.',
  'Sandor Clegane': "Hates fire. Ironically, that's most of this game.",
  Brienne: 'Sworn to protect her Pharaoh, whether it deserves it or not.',
  Varys: 'Serves the realm. Tonight, the realm is a 10x8 grid.',
  // Dune
  'Paul Atreides': 'Sees many futures. In most of them, he wins this game.',
  Chani: 'Fremen through and through — reads the board like desert wind.',
  'Duncan Idaho': 'Loyal to a fault, quick with a blade and a rotation.',
  'Lady Jessica': 'Bene Gesserit training makes for an unreadable poker face.',
  Stilgar: "Respects strength. Respects a well-placed mirror even more.",
  'Gurney Halleck': 'Plays a mean baliset and an even meaner endgame.',
  'Leto Atreides': "A duke's composure, even when the laser's coming for his Pharaoh.",
  'Liet-Kynes': 'Reads the sands, and apparently the board, better than most.',
  // Star Wars
  'Luke Skywalker': "Used the Force to align this Sphinx. Probably. Don't check.",
  'Leia Organa': 'Organized the Rebellion. This board is comparatively simple.',
  'Han Solo': "Shot first. Rotates first, too, if you're not careful.",
  'Obi-Wan': "Hello there. This is the laser trace you're looking for.",
  'Ahsoka Tano': 'Left the Order, kept the reflexes — and the good angles.',
  'Darth Vader': "Finds your lack of defense disturbing.",
  'Mace Windu': "That's no ordinary Pyramid — that one's purple.",
  'Boba Fett': "This is the way to a Pharaoh pin, apparently.",
  // Lord of the Rings
  'Frodo Baggins': "Just wants to get this board to Mordor and be done with it.",
  Aragorn: "There is always hope — and a decent mirror angle.",
  Gandalf: 'You shall not pass — unless the laser says otherwise.',
  Legolas: "Counts the moves as he counts kills. Loses count either way.",
  Gimli: "Nobody tosses an Obelisk. Nobody.",
  Éowyn: 'No mere strategy will stop this one.',
  Samwise: "Doesn't know much about laser chess, but won't leave his Pharaoh behind.",
  Boromir: 'One does not simply walk into a beam path.',
}

/** The hotseat character popup's bio for a synthesized identity's `displayName`. */
export function bioFor(displayName: string): string {
  return LOCAL_PLAYER_BIOS[displayName as (typeof LOCAL_PLAYER_NAMES)[number]] ?? ''
}

/**
 * Picks two distinct names and two distinct avatars for a fresh local game's P1/P2 seats.
 * `Math.random` is fine here — this is cosmetic, not security- or fairness-sensitive.
 */
export function pickLocalPlayerIdentities(): [LocalPlayerIdentity, LocalPlayerIdentity] {
  const [nameA, nameB] = sampleTwoDistinct(LOCAL_PLAYER_NAMES)
  const [avatarA, avatarB] = sampleTwoDistinct(AVATAR_IDS)
  return [
    { displayName: nameA, avatarId: avatarA },
    { displayName: nameB, avatarId: avatarB },
  ]
}

function sampleTwoDistinct<T>(pool: readonly T[]): [T, T] {
  const i = Math.floor(Math.random() * pool.length)
  let j = Math.floor(Math.random() * (pool.length - 1))
  if (j >= i) j += 1 // skip over i, keeping the second pick uniform over the remaining values
  return [pool[i], pool[j]]
}
