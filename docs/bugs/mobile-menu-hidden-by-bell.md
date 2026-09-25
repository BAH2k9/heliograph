---
status: needs-owner-check
area: web
reported: 2026-09-25
---
## Report
"Currently when i load the app and have it downloaded I cant see the left menu bar to navigate to
playing a game" — owner, on the installed PWA on a phone.

## Notes
- Below `md` the left `Sidebar` is hidden (`web/src/layout/AppLayout.tsx:144`) and nav moves into
  `MobileNav`'s hamburger drawer, whose trigger sits at the top-right of the mobile top bar
  (`web/src/components/MobileNav.tsx:40-51`: `px-3`, 40×40 trigger, top `max(0.5rem, safe-area)`).
- `PendingInvitesTray`'s bell is `fixed right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-40`,
  also 40×40 (`web/src/components/PendingInvitesTray.tsx:105`) — geometrically almost exactly on top
  of the hamburger (bell x ∈ [W-56, W-16], hamburger x ∈ [W-52, W-12]), and it wins on z-order.
  Hypothesis: the only mobile nav entry point is covered, so a tap opens notifications instead.
  On `md+` there's no conflict because `MobileNav` is `md:hidden`.

- The claude-in-chrome extension wasn't connected, so the repro ran in headless Chrome (the
  installed `chrome.exe`, driven by a scratchpad-only `puppeteer-core` script with mobile + touch
  emulation) instead. It can't emulate safe-area insets, which are 0 there.

- 2026-09-25, follow-up on `feat/mobile-tab-bar`: the top-bar hamburger is gone entirely. The
  drawer now opens from the More tab of the new bottom tab bar (`web/src/components/MobileTabBar.tsx`),
  and the top bar has no buttons, so the bell's corner stays clear. `MobileNav.test.tsx` now
  asserts that. The owner check below becomes: on the installed PWA, the bottom tab bar shows
  and More opens the drawer, clear of the status bar and home indicator.

## Repro steps
1. `npm run dev` in `web/` (no API needed; the invite fetches fail with Bad Gateway, which is fine).
2. Mobile viewport 390×844 (also 360 and 320), touch enabled.
3. On `/login`, seed a session so `AppLayout`'s login gate lets you through:
   `localStorage['heliograph.auth'] = {"state":{"accessToken":null,"refreshToken":null,"user":{"id":"u1","email":"a@b.c","displayName":"Tester","ratings":[],"avatarId":null,"isAdmin":false}},"version":1}`,
   then load `/`.
4. Read the rects of `button[aria-label="Menu"]` and `button[aria-label="Notifications"]`, run
   `elementFromPoint` at the Menu button's center, then tap there.

Observed at 390px: Menu `{x:338,y:8,40×40}`, Notifications `{x:334,y:12,40×40}`. `elementFromPoint`
at the Menu center returns the Notifications button. The tap opens the "Match invites" panel and the
nav drawer stays closed. Same result at 360px. On screen the hamburger is invisible and only the
bell shows.

## Root cause
Two components claim the same top-right corner below `md`, and the fixed one wins.
`MobileNav` (`web/src/components/MobileNav.tsx`) put its drawer trigger at the right end of a
`justify-between` bar. `PendingInvitesTray` (`web/src/components/PendingInvitesTray.tsx`) is an
always-mounted `fixed right-4 z-40` bell of the same size. So on any phone-width viewport the
only way into navigation was fully covered. Desktop was unaffected because `MobileNav` is
`md:hidden` there and the full `Sidebar` rail shows instead.

## Fix
- `MobileNav`: the hamburger moves to the bar's left edge (before the wordmark), which also matches
  the drawer sliding in from the left. The top-right corner stays the bell's.
- `MobileNav` drawer: `bg-surface` plus `env(safe-area-inset-top/bottom/left)` padding, so in the
  installed window the drawer's logo isn't under the status bar and Logout isn't under the home
  indicator.
- `PendingInvitesTray`: below `md` the bell uses the bar's `top` offset (`max(0.5rem, inset)`) so it
  sits level with the hamburger and wordmark. `md+` keeps its old `0.75rem`.
- PR: https://github.com/BAH2k9/heliograph/pull/108

## Verification
Status is `needs-owner-check`: this was only checked in an ad-hoc headless session, per the skill.
- Same headless repro after the fix, at 390/360/320px: Menu `{x:12,y:8}`, Notifications `{x:W-56,y:8}`,
  no overlap. `elementFromPoint` at the Menu center returns Menu, and tapping opens the nav drawer
  (Local Play / Play Bot / Challenge a Friend / … / Logout all visible), not the invites panel.
- **Not checked:** real safe-area insets (headless reports 0), so the drawer's status-bar and
  home-indicator padding is unverified on a device.
- **No durable regression test:** the bug is layout overlap, which jsdom can't compute (no layout
  engine), and the repo has no e2e harness. The existing `MobileNav.test.tsx` still covers the
  drawer's open/close and nav-action behaviour (all 439 web tests pass).
- **Owner check:** on the installed PWA on a phone, confirm ☰ shows top-left, opens the drawer,
  and the drawer's top and bottom rows clear the status bar and home indicator.
