import type { ReactElement } from 'react'

/**
 * The fixed 8-avatar preset set (pinned in `backlog/04-player-profile-board-identity.md`'s "Owner
 * decision already made" — no uploads, so this is the complete, permanent set). Must match the
 * backend's `AvatarCatalog` names exactly; the id is all that's ever stored/sent on the wire.
 * The set was replaced in the Heliograph rebrand; ids stored before then are remapped by a
 * migration, and until it runs they fall back to the initial like any other unknown id.
 */
export const AVATAR_IDS = [
  'sun',
  'tower',
  'lens',
  'compass',
  'gear',
  'kite',
  'lantern',
  'sextant',
] as const

export type AvatarId = (typeof AVATAR_IDS)[number]

export function isKnownAvatar(id: string): id is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(id)
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-2xl',
}

/**
 * Shared by the sidebar, `ProfilePage`, and `PlayerCard`. `avatarId` null/unset — or an
 * unrecognized id, e.g. stale data from before a preset was renamed — falls back to the display
 * name's first letter, exactly like the pre-avatar-picker behavior every caller already had.
 */
export function Avatar({
  avatarId,
  displayName,
  size = 'md',
}: {
  avatarId?: string | null
  displayName: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const known = avatarId && isKnownAvatar(avatarId) ? avatarId : null

  return (
    <span
      data-testid={known ? `avatar-${known}` : 'avatar-fallback'}
      title={known ?? displayName}
      className={[
        'flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-fg',
        SIZE_CLASSES[size],
      ].join(' ')}
    >
      {known ? <AvatarGlyph id={known} /> : displayName.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** One flat SVG glyph per preset, drawn in a 24x24 box (matching `Sidebar`'s nav-icon style) so
 *  it scales cleanly inside any of `Avatar`'s size classes. */
function AvatarGlyph({ id }: { id: AvatarId }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[id]}
    </svg>
  )
}

const GLYPHS: Record<AvatarId, ReactElement> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M18.5 12h3M16.6 16.6l2.1 2.1M12 18.5v3M7.4 16.6l-2.1 2.1M5.5 12h-3M7.4 7.4L5.3 5.3M12 5.5v-3M16.6 7.4l2.1-2.1" />
    </>
  ),
  tower: (
    <>
      <path d="M8.5 5.5L12 2.5l3.5 3" />
      <rect x="9" y="5.5" width="6" height="4.5" rx="0.8" />
      <path d="M10 10l-1.5 11M14 10l1.5 11M7 21h10M10.5 15.5h3" />
    </>
  ),
  lens: (
    <>
      <path d="M12 3c2.8 3 2.8 15 0 18-2.8-3-2.8-15 0-18z" />
      <path d="M2.5 8.5h7.5M2.5 15.5h7.5M14 8.5l7.5 6M14 15.5l7.5-6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 5l2.2 7H9.8z" fill="currentColor" stroke="none" />
      <path d="M9.8 12h4.4L12 19z" />
    </>
  ),
  gear: (
    <>
      <polygon points="10.4,5.2 10.8,2.6 13.2,2.6 13.6,5.2 15.7,6.1 17.8,4.5 19.5,6.2 17.9,8.3 18.8,10.4 21.4,10.8 21.4,13.2 18.8,13.6 17.9,15.7 19.5,17.8 17.8,19.5 15.7,17.9 13.6,18.8 13.2,21.4 10.8,21.4 10.4,18.8 8.3,17.9 6.2,19.5 4.5,17.8 6.1,15.7 5.2,13.6 2.6,13.2 2.6,10.8 5.2,10.4 6.1,8.3 4.5,6.2 6.2,4.5 8.3,6.1" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  kite: (
    <>
      <path d="M12 2l5.5 7L12 18 6.5 9z" />
      <path d="M12 2v16M6.5 9h11" />
      <path d="M12 18q-2.2 1.3 0 2.6t0 2.6" />
    </>
  ),
  lantern: (
    <>
      <path d="M9.5 5a2.5 2.5 0 0 1 5 0" />
      <path d="M8 7.5L9 5h6l1 2.5" />
      <rect x="8" y="7.5" width="8" height="10.5" rx="1.5" />
      <path d="M7.5 20.5h9M9 18v2.5M15 18v2.5" />
      <path d="M12 10c1.6 1.8 1.6 3.6 0 4.8-1.6-1.2-1.6-3 0-4.8z" fill="currentColor" stroke="none" />
    </>
  ),
  sextant: (
    <>
      <path d="M12 3L6.2 19A17 17 0 0 0 17.8 19z" />
      <path d="M12 3l2.6 15.4M7.5 12.5h5" />
      <circle cx="12" cy="3.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
}
