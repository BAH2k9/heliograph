import { describe, expect, it } from 'vitest'
import { pwaOptions } from './pwa.config.ts'

// A full `vite build` assertion is heavy for what this is guarding — the properties below are
// the ones that, if silently reverted, would break the app rather than just the icon/PWA polish
// (see backlog/05-pwa.md's "Owner decisions already made" and the SW config comments in
// pwa.config.ts for why each one is pinned).
describe('pwaOptions', () => {
  it('prompts for updates instead of silently reloading mid-match', () => {
    expect(pwaOptions.registerType).toBe('prompt')
  })

  it('never lets the app shell fallback answer for /api/*', () => {
    const denylist = pwaOptions.workbox?.navigateFallbackDenylist ?? []
    expect(denylist.some((re) => re.test('/api/games/1'))).toBe(true)
    expect(denylist.some((re) => re.test('/api/hub'))).toBe(true)
    expect(denylist.some((re) => re.test('/play'))).toBe(false)
  })

  it('lets /admin* and /cdn-cgi/* page loads reach the network, so Cloudflare Access can sign in', () => {
    const denylist = pwaOptions.workbox?.navigateFallbackDenylist ?? []
    expect(denylist.some((re) => re.test('/admin'))).toBe(true)
    expect(denylist.some((re) => re.test('/admin/users'))).toBe(true)
    expect(denylist.some((re) => re.test('/cdn-cgi/access/authorized?token=x'))).toBe(true)
    expect(denylist.some((re) => re.test('/archive'))).toBe(false)
  })

  it('treats /api/* as NetworkOnly, belt-and-braces on top of the denylist', () => {
    const apiRule = pwaOptions.workbox?.runtimeCaching?.find((rule) => {
      const matcher = rule.urlPattern as (ctx: { url: URL }) => boolean
      return matcher({ url: new URL('https://example.test/api/games/1') })
    })
    expect(apiRule?.handler).toBe('NetworkOnly')
  })

  it('has no runtime rule for a third-party font CDN (the display face is self-hosted)', () => {
    const rules = pwaOptions.workbox?.runtimeCaching ?? []
    const fontCdnRule = rules.find((rule) => {
      const matcher = rule.urlPattern as (ctx: { url: URL }) => boolean
      return matcher({ url: new URL('https://fonts.gstatic.com/s/x.woff2') })
    })
    expect(fontCdnRule).toBeUndefined()
    expect(pwaOptions.workbox?.globPatterns?.[0]).toContain('woff2')
  })

  it('falls back to index.html for client routes', () => {
    expect(pwaOptions.workbox?.navigateFallback).toBe('/index.html')
  })

  it('installs under the full name, never a shortened one', () => {
    // The trademark clearance for "Heliograph" is conditional on never shortening it to "Helio".
    const manifest = pwaOptions.manifest
    if (!manifest) throw new Error('pwaOptions.manifest is missing')
    expect(manifest.name).toBe('Heliograph')
    expect(manifest.short_name).toBe('Heliograph')
  })
})
