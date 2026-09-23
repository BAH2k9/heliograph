const SIZES = { sm: 24, md: 32, lg: 48 } as const

/**
 * The app mark: a sun disc and the flash its mirror throws, the same two shapes as
 * public/favicon.svg (keep them in sync). Flat fills with no gradient, so there are no
 * element ids to collide when several logos render on one page.
 */
export function Logo({
  withWordmark = false,
  size = 'md',
}: {
  withWordmark?: boolean
  size?: keyof typeof SIZES
}) {
  const px = SIZES[size]
  return (
    <div className="flex items-center gap-2">
      <svg width={px} height={px} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="18.34" cy="29.66" r="11" fill="#E0A030" />
        <polygon points="27.36,18.87 29.13,20.64 45.92,13.39 34.61,2.08" fill="#F5C95A" />
      </svg>
      {withWordmark && (
        <span className="font-display text-xl font-semibold tracking-wide text-text">
          Khet
        </span>
      )}
    </div>
  )
}
