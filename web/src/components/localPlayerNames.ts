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
