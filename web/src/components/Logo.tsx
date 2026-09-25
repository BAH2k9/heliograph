import { Link } from 'react-router-dom'

const SIZES = { sm: 24, md: 32, lg: 48 } as const

type LogoProps = {
  withWordmark?: boolean
  size?: keyof typeof SIZES
}

/**
 * The app mark: a Mirror tile, a beam turning 90° off the mirrored diagonal. The same three
 * shapes as public/favicon.svg (Logo.test.tsx fails if they drift). Flat fills with no gradient,
 * so there are no element ids to collide when several logos render on one page.
 */
export function Logo({ withWordmark = false, size = 'md' }: LogoProps) {
  const px = SIZES[size]
  return (
    <div className="flex items-center gap-2">
      <svg width={px} height={px} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect width="48" height="48" rx="10" fill="#171B21" />
        <polygon points="39,9 39,39 9,39" fill="#A7D8E6" />
        <polygon points="0,21 21,21 21,0 27,0 27,21 21,27 0,27" fill="#E0A030" />
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
