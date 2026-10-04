---
feature: player-profile-board-identity
status: done
depends_on: ["rating-by-time-control"]
backend_branch: feat/player-profile-board-identity-be
frontend_branch: feat/player-profile-board-identity-fe
---

# Player profile & board identity

## Vault context

- `Auth UI Manual QA Checklist.md` — unfinished manual-QA items on the exact surfaces this plan
  touches: sidebar avatar-initial → real picked avatar, `ProfilePage` layout, "AuthDialog visuals
  generally." Worth checking off/updating alongside this plan's frontend work rather than
  duplicating a second checklist.
- `Progress.md` (Phase 4 frontend section, PR #19 `feat/auth-ui`) — the existing `ProfilePage`,
  sidebar (display-name + avatar-initial + Logout), and `SettingsDialog` this plan extends with the
  avatar picker and `PlayerCard`.
- `Roadmap.md` (▶ Phase 2 intro + ▶ Phase 4) — the "chess.com for Heliograph" framing this plan's
  chess.com-style player cards are modeled on, plus the auth/profile groundwork PR #19 shipped.

(These notes are tracked privately, outside this repo.)

## Depends on

`rating-by-time-control` (`03-rating-by-time-control.md`) must be `status: done` first — this
feature displays "rating for this game's time-control category," which doesn't exist until that
plan merges. **The orchestrator must not start this plan concurrently with plan 03.**

## Why

Nobody's identity shows up during play at all — no avatar, no name, no per-game-relevant rating
anywhere near the board — and the clock is a single ambiguous central widget in `RoomStatusBar`,
not visually tied to either player. Wanted: a chess.com-style pair of player cards flanking the
board, with the clock relocated onto them so it's obvious whose time is whose.

## Owner decision already made

Avatars are a **fixed preset set, not uploads** — 8 inline-SVG, game-themed icons. No file
storage, no upload endpoint, no moderation surface — deliberately, to keep this a clean
frontend-asset feature where the backend only ever stores/validates a known string id. The 8 ids
(pinned here so backend and frontend don't invent different names independently):

```
pharaoh, obelisk, pyramid, anubis, sphinx, scarab, ankh, eye-of-horus
```

## Wire contract

- `ApplicationUser` (`backend/api/Domain/ApplicationUser.cs`) gains `AvatarId` (nullable string; null →
  today's initial-letter fallback avatar).
- **Contract completion (backend implementation note, not a re-litigation):** `UserProfile`
  (`backend/api/Contracts/AuthApi.cs`), returned by `GET`/`PATCH /api/auth/me` and embedded in every
  `AuthResponse`, gains `AvatarId` (nullable string, same field) as its 4th positional field —
  `(Id, Email, DisplayName, AvatarId, Ratings)`. The plan's prose named this on `ApplicationUser`
  but not on the wire-facing `UserProfile`; without it the frontend avatar picker/sidebar has no way
  to read the current selection back. `PatchMeRequest(string? DisplayName, string? AvatarId)` is the
  `PATCH` body — both optional; a null/omitted field leaves that part of the profile unchanged (STJ
  can't distinguish omitted from explicit `null` on a plain `string?`, so this endpoint has no
  "clear back to unset" affordance for either field).
- `PATCH /api/auth/me` — `[Authorize]`, body `{ "displayName"?: string, "avatarId"?: string }`.
  - 400 `{ "error": "unknown avatar '...'" }` for an avatar id not in the pinned set above (add an
    `UnknownAvatarException`, mirroring `UnknownRuleSetException`'s pattern).
  - 400 for an empty/whitespace `displayName` if provided.
  - 401 if unauthenticated.
  - 200 → the updated `UserProfile` (same shape `GET /api/auth/me` returns, including `Ratings`
    from plan 03).
- `GameResponse` (returned by `POST/GET /api/games/{id}` and the room create/join flows) gains
  `P1Profile`/`P2Profile`: nullable `PlayerSummary(string DisplayName, string? AvatarId, int
  Rating)`.
  - Null while that seat is still anonymous/unclaimed.
  - `Rating` is the category bucket (from plan 03's `Ratings`) matching *this game's*
    `TimeControl`; for an untimed game (no bucket applies per plan 03), use `0` — be consistent
    about this, don't mix `0` and omission.
- Backend avatar registry (mirrors `RuleSets`/`TimeControls`' `For`/`IsKnown` static-registry
  shape) exposing the same 8 names as the frontend's `AVATARS` map — these must match exactly.

## Backend scope

- `backend/api/Domain/AvatarCatalog.cs` (or similar): static registry of the 8 pinned ids, `IsKnown`/`Names`
  following the `RuleSets`/`TimeControls` shape.
- Migration adding nullable `AvatarId` to the Identity user table.
- `AuthController` gains the `PATCH /me` action (or wherever profile mutation belongs alongside the
  existing register/login/refresh/me actions); validates avatar id + display name as above; returns
  the updated `UserProfile`.
- `GameService.ToResponse` (`backend/api/Services/GameService.cs`) joins `P1UserId`/`P2UserId` (when set)
  to `ApplicationUser` and projects `PlayerSummary` using the category rating matching
  `game.TimeControl`.

## Frontend scope

- `web/src/components/Avatar.tsx`: the 8 inline-SVG icons keyed by the pinned ids above, plus the
  existing initial-letter fallback render for `null`/unset.
- Account settings: extend `web/src/components/SettingsDialog.tsx` (or `web/src/pages/
  ProfilePage.tsx` directly — your call, keep it wherever fits the existing settings UX best) with
  a display-name field and an 8-icon picker grid, calling `PATCH /api/auth/me`, updating
  `web/src/authStore.ts`.
- New `web/src/components/PlayerCard.tsx`: avatar + display name (or "Guest"/"Waiting for
  opponent…" when `PlayerSummary` is null) + the rating badge from `PlayerSummary.Rating`. Rendered
  twice in `web/src/pages/PlayScreen.tsx`: opponent above the board, "you" below (or however seat
  is used to decide the physical layout — your call, but keep it consistent with which side is
  visually "yours").
- **Clock refactor — read this carefully, it's the one place a naive split introduces a bug.**
  `web/src/components/GameClock.tsx` currently bundles two things in one component: (a) the
  ticking/auto-claim-timeout side effect (the `useClockTick` hook plus the `claimedDeadline`
  ref+effect that fires `claimTimeout()`), and (b) rendering both `ClockFace`s. Split it:
  - Keep exactly **one** mounted instance of the ticking/auto-claim logic — extract it into its own
    hook (e.g. `useClockAutoClaim()`) mounted once in `PlayScreen.tsx`.
  - Turn `ClockFace` into a standalone presentational component, instantiated **once each** inside
    the two new `PlayerCard`s (fed remaining-ms/active/isDaily as props, same as today).
  - Do **not** mount the auto-claim effect twice by naively rendering the old `GameClock` structure
    inside each `PlayerCard` — a duplicate `claimTimeout()` call is harmless (it just 409s) but
    wasteful, and the point of naming this explicitly is to avoid relying on that 409 as a safety
    net rather than just structuring it correctly.
- `web/src/components/RoomStatusBar.tsx` drops its `<GameClock />` render (the clock lives in the
  player cards now) but keeps room code / leave / claim-seat / rated badge as-is.

## Tests

- Update `web/src/components/GameClock.test.tsx` and `web/src/components/RoomStatusBar.test.tsx`
  for the relocation (split test coverage between the new hook/`ClockFace` and `PlayerCard` as the
  refactor implies).
- Add `web/src/components/PlayerCard.test.tsx`.
- Extend `backend/api.tests/Api/AuthEndpointIntegrationTests.cs` for `PATCH /me`: valid update, unknown
  avatar 400, empty display name 400, unauthenticated 401.
- Extend `backend/api.tests/Api/GamesEndpointIntegrationTests.cs` to assert `P1Profile`/`P2Profile` appear
  correctly: null while unclaimed, populated with the right category rating once a seat is claimed.

## Out of scope

- Custom avatar uploads.
- A full "profile customization" system beyond display name + avatar.
- Changing which side of the board is visually top/bottom based on seat — that's an existing,
  separate concern, not touched here.

## If blocked

Edit this file's frontmatter to `status: blocked` plus a one-line `blocker:` if something genuinely
ambiguous comes up beyond what's resolved above (including if plan 03 hasn't actually merged yet —
though the orchestrator shouldn't have started this plan in that case); stop without opening a PR.
Ordinary implementation judgment calls are yours — don't block on those.
