import { Link } from 'react-router-dom'

/**
 * The app's ownership statement (IP-06): a small, unobtrusive © line on every logged-in page,
 * linking to `/credits` (the font/library notices page, kept reachable without a session —
 * see `App.tsx`). Lives at the bottom of `AppLayout`'s content column, not in `LoginPage`,
 * which sits outside the shared shell.
 */
export function Footer() {
  return (
    <footer className="shrink-0 px-4 py-2 text-center text-xs text-text-subtle sm:text-right">
      <Link to="/credits" className="hover:text-text-muted hover:underline">
        © 2026 Bailey Halliday
      </Link>
    </footer>
  )
}
