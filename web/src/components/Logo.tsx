import { Link } from 'react-router-dom'

const SIZES = { sm: 24, md: 32, lg: 48 } as const

type LogoProps = {
  withWordmark?: boolean
  size?: keyof typeof SIZES
}

/**
 * The app mark: a sun disc and the flash its mirror throws, the same two shapes as
 * public/favicon.svg (keep them in sync). Flat fills with no gradient, so there are no
 * element ids to collide when several logos render on one page.
 */
export function Logo({ withWordmark = false, size = 'md' }: LogoProps) {
  const px = SIZES[size]
  return (
    <div className="flex items-center gap-2">
      <svg width={px} height={px} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="18.34" cy="29.66" r="11" fill="#E0A030" />
        <polygon points="27.36,18.87 29.13,20.64 45.92,13.39 34.61,2.08" fill="#F5C95A" />
      </svg>
      {withWordmark && (
        <span className="font-display text-xl font-semibold tracking-wide text-text">
          Heliograph
        </span>
      )}
    </div>
  )
}

/**
 * The logo as a link back to the landing page, for the in-app chrome (sidebar, the phone's top
 * bar and drawer, the play/replay headers). A real link, not a button, so it opens in a new tab
 * like any other and doesn't count against the phone top bar's no-buttons rule (see
 * `MobileNav`). `onClick` is for a container that has to react to the navigation, i.e. the
 * phone's drawer closing itself.
 */
export function HomeLogo({ onClick, ...logo }: LogoProps & { onClick?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="Heliograph home"
      // The mark-only rail has no visible text, so it gets the same hover tooltip a NavItem does.
      title={logo.withWordmark ? undefined : 'Home'}
      className="flex w-fit rounded transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <Logo {...logo} />
    </Link>
  )
}
