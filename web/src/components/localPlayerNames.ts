import { AVATAR_IDS } from './Avatar'

/**
 * Invented character names for Local Play's two hotseat "guest" seats, themed on the people who
 * staff a heliograph network: four made-up posts of eight (Signal Hill, the Observatory, the Relay
 * Line, the Survey Camp). All are original. None is a real person or a character from any existing
 * work, which is deliberate (IP-05); keep it that way when adding names. Local play has no accounts
 * to name the seats after (see `store.ts`'s `newGame`), so this stands in for the "Guest" fallback
 * `PlayerCard` used to show, matching the signed-in card's look via a real `displayName` +
 * `avatarId` instead of null. Mirrors `Avatar.tsx`'s `AVATAR_IDS` as a small fixed-pool module.
 * Keep names to 16 characters or fewer: `PlayerCard` truncates.
 */
export const LOCAL_PLAYER_NAMES = [
  // Signal Hill
  'Sergeant Ottery',
  'Corporal Vesk',
  'Tamsin Glaive',
  'Private Dunnock',
  'Ines Marrowby',
  'Captain Soller',
  'Bram Ketterick',
  'Wynn Farrant',
  // The Observatory
  'Dr. Hesper Vale',
  'Prof. Amery Toll',
  'Clerk Farthing',
  'Mira Lusk',
  'Keeper Ashgill',
  'Orrin Veale',
  'Astra Pennock',
  'Dr. Ilse Garrow',
  // The Relay Line
  'Lampman Creel',
  'Juno Haskett',
  'Runner Tibbet',
  'Cassia Wrenfold',
  'Lineman Brough',
  'Rhosyn Cordell',
  'Operator Maske',
  'Anselm Quarry',
  // The Survey Camp
  'Surveyor Loam',
  'Hollis Dray',
  'Chainman Oakes',
  'Verity Solace',
  'Mapwright Eddo',
  'Wilder Talbeck',
  'Trigman Greave',
  'Nell Ferrow',
] as const

/** One seat's synthesized identity for Local Play. */
export interface LocalPlayerIdentity {
  displayName: string
  avatarId: string
}

/**
 * Short in-world one-liners, keyed by `displayName` — the hotseat character popup's bio
 * (`backlog/09-player-info-popup.md`). Looked up by `bioFor`, not returned from
 * `pickLocalPlayerIdentities`, so the identity shape store.ts already persists is untouched.
 */
const LOCAL_PLAYER_BIOS: Record<(typeof LOCAL_PLAYER_NAMES)[number], string> = {
  // Signal Hill
  'Sergeant Ottery': 'Twenty years on Signal Hill. Reads a flash through fog and a bluff through a grin.',
  'Corporal Vesk': 'Polishes every mirror twice. Aims each one once.',
  'Tamsin Glaive': 'Sends her messages in short, bright bursts. Plays the same way.',
  'Private Dunnock': 'Newest on the hill, and quietly keeping a tally of every beam he dodges.',
  'Ines Marrowby': 'Keeps the station log in perfect copperplate, including your mistakes.',
  'Captain Soller': 'Believes any position can be held with patience and one well-placed Bastion.',
  'Bram Ketterick': 'Carried the tripod up the hill in the rain. Considers this board a rest.',
  'Wynn Farrant': 'Times every flash to the half-second, and every trap the same way.',
  // The Observatory
  'Dr. Hesper Vale': 'Charts the sky by night and the angles by day. Rarely wrong about either.',
  'Prof. Amery Toll': 'Lectures on reflection at length. Demonstrates it briefly and decisively.',
  'Clerk Farthing': 'Files every move in triplicate. Somehow still plays faster than you.',
  'Mira Lusk': 'Grinds her own lenses. Sees the long diagonal before anyone else.',
  'Keeper Ashgill': 'Winds the dome clock at midnight, and guards the Keep as if it were the telescope.',
  'Orrin Veale': 'Works the night shift and plays like it: patient, still, then suddenly over.',
  'Astra Pennock': 'Logged a comet a week before anyone else. Finds the gap in a defence just as early.',
  'Dr. Ilse Garrow': 'Checks every angle twice and never apologises for the result.',
  // The Relay Line
  'Lampman Creel': 'Trims the signal lamps at dusk. Trims your options just as tidily.',
  'Juno Haskett': 'Relays messages between three stations without garbling one. Never forgets a move either.',
  'Runner Tibbet': 'Fastest legs on the relay line. Slightly slower at deciding which piece to move.',
  'Cassia Wrenfold': "Talks in dots and dashes when she's winning. Expect to hear a lot of them.",
  'Lineman Brough': 'Has mended every mile of the line at least once. Knows exactly where things break.',
  'Rhosyn Cordell': 'Hums while she plays. The humming stops just before the beam fires.',
  'Operator Maske': 'Taps out a reply before you finish the question. Moves the same way.',
  'Anselm Quarry': 'Built half the relay towers by hand. Treats a Bastion like an old friend.',
  // The Survey Camp
  'Surveyor Loam': 'Walks every inch of ground before committing. Every inch of board, too.',
  'Hollis Dray': 'Hauls the theodolite up hills for fun. Enjoys the long way round to your Keep.',
  'Chainman Oakes': 'Measures distance in chains and patience in years.',
  'Verity Solace': 'Calm, precise and unhurried. Somehow always a square ahead.',
  'Mapwright Eddo': 'Redraws every game as a map afterwards, with your losses marked in red ink.',
  'Wilder Talbeck': 'Takes bearings off distant peaks and bets on the angles nobody else checks.',
  'Trigman Greave': 'Lives by the trig point, where every line meets. Likes a crossfire for the same reason.',
  'Nell Ferrow': 'Signs every survey with a tiny sun, and every win the same way.',
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
