import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AVATAR_IDS, Avatar, isKnownAvatar } from './Avatar'

describe('Avatar', () => {
  it('renders a glyph for every preset id', () => {
    for (const id of AVATAR_IDS) {
      const { unmount } = render(<Avatar avatarId={id} displayName="Ana" />)
      const el = screen.getByTestId(`avatar-${id}`)
      expect(el.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  // A stored id from a retired preset set (the rebrand replaced all eight) must not crash or
  // render an empty circle before the data migration remaps it: it falls back to the initial.
  it('falls back to the initial for an unknown, non-null id', () => {
    expect(isKnownAvatar('retired-preset')).toBe(false)
    render(<Avatar avatarId="retired-preset" displayName="bo" />)
    const el = screen.getByTestId('avatar-fallback')
    expect(el).toHaveTextContent('B')
    expect(el.querySelector('svg')).toBeNull()
  })
})
