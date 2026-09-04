import { useId } from 'react'

const SIZES = { sm: 24, md: 32, lg: 48 } as const

/**
 * The Khet mark — the outer silhouette from favicon.svg, recoloured with a gradient and
 * reused inline (unlike the favicon file, which layers 16 blurred ellipses meant for a
 * small tab icon; that's too heavy and id-collision-prone to render repeatedly in-app).
 */
export function Logo({
  withWordmark = false,
  size = 'md',
}: {
  withWordmark?: boolean
  size?: keyof typeof SIZES
}) {
  const px = SIZES[size]
  const gradId = `khet-logo-grad-${useId()}`
  return (
    <div className="flex items-center gap-2">
      <svg width={px} height={px * (46 / 48)} viewBox="0 0 48 46" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="46">
            <stop offset="0" stopColor="#7e14ff" />
            <stop offset="1" stopColor="#47bfff" />
          </linearGradient>
        </defs>
        <path
          d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
          fill={`url(#${gradId})`}
        />
      </svg>
      {withWordmark && (
        <span className="font-display text-xl font-semibold tracking-wide text-slate-100">
          Khet
        </span>
      )}
    </div>
  )
}
