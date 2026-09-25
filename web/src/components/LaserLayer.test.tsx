import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_SETTINGS } from '../settings/displaySettings'
import { useGame } from '../store'
import { LaserLayer } from './LaserLayer'

const initialGameState = useGame.getState()

afterEach(() => {
  useGame.setState(initialGameState, true)
})

function fireBeam() {
  useGame.setState({
    beam: {
      id: 1,
      points: [
        { x: 0.5, y: 0 },
        { x: 0.5, y: 4.5 },
        { x: 6, y: 4.5 },
      ],
    },
  })
}

describe('LaserLayer', () => {
  it('renders nothing while no beam is in flight', () => {
    const { container } = render(<LaserLayer />)
    expect(container.querySelector('svg')).toBeNull()
  })

  // Regression guard for docs/bugs/phone-animation-jank.md: a blur filter on the animated beam
  // gets redone every frame, and phones that run SVG filters on the CPU drop to ~2 fps. The glow
  // has to stay plain strokes. This can't measure frame rate (jsdom doesn't paint); it only stops
  // the filter from quietly coming back.
  it('draws the beam without any SVG or CSS filter', () => {
    fireBeam()
    const { container } = render(<LaserLayer />)

    expect(container.querySelector('filter')).toBeNull()
    for (const el of container.querySelectorAll('svg *')) {
      expect(el.getAttribute('filter')).toBeNull()
      expect((el as SVGElement).style.filter).toBe('')
    }
  })

  it('stacks a wider, fainter halo under the glow band, with the core on top', () => {
    fireBeam()
    const { container } = render(<LaserLayer />)
    const [halo, glow, core] = [...container.querySelectorAll('polyline')]
    const { glowWidth, glowOpacity, coreWidth } = DEFAULT_DISPLAY_SETTINGS.laser

    expect(Number(halo.getAttribute('stroke-width'))).toBeGreaterThan(glowWidth)
    expect(Number(halo.getAttribute('stroke-opacity'))).toBeLessThan(glowOpacity)
    expect(Number(glow.getAttribute('stroke-width'))).toBe(glowWidth)
    expect(Number(core.getAttribute('stroke-width'))).toBe(coreWidth)
  })
})
