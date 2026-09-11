import type { ReactElement } from 'react'

/**
 * The fixed 8-avatar preset set (pinned in `plans/04-player-profile-board-identity.md`'s "Owner
 * decision already made" — no uploads, so this is the complete, permanent set). Must match the
 * backend's `AvatarCatalog` names exactly; the id is all that's ever stored/sent on the wire.
 */
export const AVATAR_IDS = [
  'pharaoh',
  'obelisk',
  'pyramid',
  'anubis',
  'sphinx',
  'scarab',
  'ankh',
  'eye-of-horus',
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
  pharaoh: (
    <>
      <path d="M12 3l3 4H9l3-4z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="7" />
      <circle cx="12" cy="14" r="3" />
    </>
  ),
  obelisk: (
    <>
      <path d="M12 2l2 3H10l2-3z" fill="currentColor" stroke="none" />
      <rect x="9" y="5" width="6" height="16" rx="1" />
    </>
  ),
  pyramid: <polygon points="12,4 21,20 3,20" />,
  anubis: (
    <>
      <path d="M7 21c0-4 1-7 1-10 0-3 2-6 4-6s4 3 4 6c0 3 1 6 1 10" />
      <path d="M8 11L5 7l3 1" />
      <path d="M16 11l3-4-3 1" />
    </>
  ),
  sphinx: (
    <>
      <rect x="3" y="14" width="14" height="5" rx="2" />
      <circle cx="18" cy="12" r="4" />
    </>
  ),
  scarab: (
    <>
      <ellipse cx="12" cy="13" rx="7" ry="8" />
      <circle cx="12" cy="5" r="2" fill="currentColor" stroke="none" />
      <path d="M12 6v14" />
      <path d="M6 10h12M5 14h14M6 18h12" />
    </>
  ),
  ankh: (
    <>
      <circle cx="12" cy="6" r="4" />
      <path d="M12 10v11" />
      <path d="M6 16h12" />
    </>
  ),
  'eye-of-horus': (
    <>
      <path d="M3 12s4-5 9-5 9 5 9 5-4 5-9 5-9-5-9-5z" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 17v3l-2 2" />
      <path d="M6 12l-3 2" />
    </>
  ),
}
