import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/games', label: 'Games', end: false },
]

/** The sub-nav shared by the three admin pages. */
export function AdminNav() {
  return (
    <div className="mb-4 flex gap-1 rounded-lg bg-surface-raised p-1 ring-1 ring-border">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            [
              'flex-1 rounded px-3 py-1.5 text-center text-sm font-medium',
              isActive ? 'bg-accent text-accent-fg' : 'text-text-muted hover:bg-white/5',
            ].join(' ')
          }
        >
          {link.label}
        </NavLink>
      ))}
    </div>
  )
}
