import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import faviconSvg from '../../public/favicon.svg?raw'
import { Logo } from './Logo'

// Every shape as `tag attr=value ...`, attributes sorted, so element order and fills both count.
function shapes(svg: Element) {
  return [...svg.children].map((el) =>
    [el.tagName.toLowerCase(), ...[...el.attributes].map((a) => `${a.name}=${a.value}`).sort()].join(' '),
  )
}

describe('Logo', () => {
  it('draws the same shapes as public/favicon.svg', () => {
    const { container } = render(<Logo />)
    const favicon = new DOMParser().parseFromString(faviconSvg, 'image/svg+xml').documentElement
    expect(shapes(container.querySelector('svg')!)).toEqual(shapes(favicon))
  })
})
