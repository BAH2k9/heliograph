---
feature: player-info-popup
status: ready
depends_on: []
backend_branch: feat/player-info-popup-be
frontend_branch: feat/player-info-popup-fe
---

# In-game player info popup (friends, hotseat, and bot)

## Context

`PlayerCard` (the strip showing each side's name/avatar/rating during a game) is currently pure
display — no click handler at all. The user wants clicking a card to open a small info popup,
with three different contents depending on what's actually in that seat:

1. **A real opponent (online match)** — a compact version of the Profile page (name, avatar,
   per-time-format rating) *excluding the games list*, plus new stats that don't exist anywhere
   yet: total games played and a win/loss record per time format. This same new data should also
   show on the full Profile page.
2. **Hotseat Local Play** — both seats are already synthesized pop-culture identities
   (`localPlayerNames.ts`, e.g. "Aragorn", "Paul Atreides") with no real account behind them.
   Clicking should show a short in-universe bio for whichever character that seat got.
3. **A bot opponent** — today the bot seat has no identity at all server-side (`PlayerCard` just
   renders "Guest"). This needs a client-side persona (name, avatar, one-line bio) invented for
   this feature, plus its real difficulty setting as its "stats" line.

Owner decisions already made (via user Q&A, not to be re-litigated):
- Both hotseat *and* bot cards get the character-popup treatment (not bot-only).
- The bot popup shows a flavor bio **plus its real, honest difficulty** — no fabricated stats.
- The real-opponent popup is reachable by **anyone viewing the game, including spectators** —
  this consciously relaxes `GameResponse`'s existing "no account ids exposed on the wire" stance,
  but only via an explicit click on a new opt-in endpoint (see below), not by adding identity to
  the passive `GameResponse` payload itself.
- "Games played" (the headline stat, both here and on Profile) means **rated games only** — this
  matches the existing `GamesPlayed` bucket semantics exactly, so it's a derived sum, not a new
  column.

## Backend (`Khet.Api` / `Khet.Contracts`)

### 1. Track wins/losses per rating bucket

`ApplicationUser` (`api/Domain/ApplicationUser.cs:59-97`) has `{Category}Rating`/`{Category}GamesPlayed`
pairs for **all five** `TimeControlCategory` values — Bullet/Blitz/Rapid/Daily/Untimed. Add the
missing half of the record for all five, following the exact same "additive columns, not a child
table" pattern:

```
BulletWins, BulletLosses, BlitzWins, BlitzLosses, RapidWins, RapidLosses, DailyWins, DailyLosses,
UntimedWins, UntimedLosses
```

(all `int`, default 0). Extend `BucketFor`/`SetBucket` (or add a parallel pair) to read/write
these alongside rating+gamesPlayed. Needs an EF Core migration.

`GameEndService.ApplyEloAsync` (`api/Services/GameEndService.cs:97-113`) is the single place both
existing counters move — it already knows which account won and which lost for the category. Add
one increment each: `winner`'s win column, `loser`'s loss column, in that same category. No other
call site needs to change; this method already runs for every decisive rated ending (resignation/
timeout/abandonment via `FinishGameAsync`, and inline for a Pharaoh win from
`GameService.SubmitMove.cs:198`).

### 2. Extend the wire contract

`Khet.Contracts/AuthApi.cs`:
- `RatingBucket(string Category, int Rating, int GamesPlayed)` → add `int Wins, int Losses`.
- `UserProfile` → add `int TotalGamesPlayed` (= sum of `GamesPlayed` across all five buckets;
  computed in the mapper, not stored).

Both `AuthService.RatingBucketsFor` (`api/Services/AuthService.cs:179-186`) and `AdminService`'s
equivalent (`api/Services/AdminService.cs:~450-455`, inline in a larger row-mapping expression)
build `RatingBucket`s from an `ApplicationUser` — factor this into one shared static mapper (e.g. a
`RatingBucketsFor(ApplicationUser)` helper usable from both, plus the new endpoint below) so the
Wins/Losses/TotalGamesPlayed logic lives in exactly one place.

### 3. New endpoint: fetch a seat's public profile from within a game

Add to `GamesController` (`api/Controllers/GamesController.cs`, alongside the existing
`{id:guid}/...` routes):

```
GET /api/games/{id:guid}/players/{seat}   (seat: "P1" | "P2")
```

Looks up the game, resolves `seat` to `P1UserId`/`P2UserId`. If that seat has no claimed
`ApplicationUser` (bot seat, or an unclaimed/hotseat seat) → 404; the frontend already knows
client-side when a seat is a bot/hotseat seat and simply won't call this endpoint for those, using
the client-only persona popups instead (see below). Otherwise loads that `ApplicationUser` and
returns a new trimmed contract:

```csharp
// Khet.Contracts/AuthApi.cs (or GameApi.cs)
public sealed record PublicPlayerProfile(
    string DisplayName, string? AvatarId, int TotalGamesPlayed, IReadOnlyList<RatingBucket> Ratings);
```

No games list, no email, no id — matches the "exclude games" requirement directly. Auth
requirement: same as the existing game-fetch endpoint (`GET /api/games/{id}`) — anyone who can view
the game can call this, per the owner decision above.

## Frontend (`web/src`)

### 1. Wire types + client

`web/src/api/authTypes.ts` (not `types.ts` — that's where `RatingBucket`/`UserProfile` actually
live): mirror the `RatingBucket` addition (`wins`, `losses`) and `UserProfile`'s `totalGamesPlayed`.
`web/src/api/types.ts`: add `PublicPlayerProfile` there instead — it's game-scoped, same as
`PlayerSummary`. `web/src/api/client.ts`: add `getPlayerProfile(gameId, seat)` →
`GET /api/games/{id}/players/{seat}`, following the same `authFetch` + `encodeURIComponent` +
`ApiError`/`readError` shape as the existing `getGame`.

### 2. Shared rating-badge rendering

`web/src/pages/ProfilePage.tsx` already renders per-category badges
(`orderedRatings(user.ratings).map(...)`, lines 84-92) with a `gamesPlayed` tooltip. Extract this
into a small reusable `web/src/components/RatingBadges.tsx` (`{ ratings: RatingBucket[] }`), extend
the tooltip/label to include the new W/L (e.g. `"12 rated games (7W–5L)"`), and use it from both
`ProfilePage` (which also gains a `TotalGamesPlayed` headline stat near the name) and the new popup
below.

### 3. The popup component

One `Dialog`/`DialogContent` (`web/src/ui/Dialog.tsx`, same pattern as `BotGameDialog.tsx`) with
three content variants, all reusing `Avatar`:
- **Real profile**: `Avatar` + name + `TotalGamesPlayed` + `RatingBadges`. Fetched on open via
  `getPlayerProfile`.
- **Hotseat character**: `Avatar` + the seat's already-assigned name (from
  `pickLocalPlayerIdentities()`, `web/src/components/localPlayerNames.ts:~52`) + a short bio. Add
  a bio string per entry in `LOCAL_PLAYER_NAMES` (`web/src/components/localPlayerNames.ts:10-42`) —
  short, in-universe, one-liners; creative-writing task.
- **Bot persona**: `Avatar` + an invented name/bio + the real `botDifficulty`. New file
  `web/src/components/botPersonas.ts` mirroring `localPlayerNames.ts`'s shape (a fixed pool +
  a pick function), themed distinctly from the hotseat pool (e.g. AI/robot/laser-themed rather
  than film characters, to keep the two visually distinguishable) — deterministically picked per
  game (seed off the game id, so the same bot identity persists across a reload) rather than
  re-randomized on every render.

### 4. Wiring `PlayerCard` and `PlayScreen`

`PlayerCard.tsx` currently has no interactivity. Add a click/keyboard handler (`role="button"`,
`onKeyDown`, same pattern as `ProfilePage`'s game-list rows) that `PlayScreen.tsx`'s
`playerCard(cardSeat)` helper (lines 56-67) wires up based on what's already known there:
- `botSeat === cardSeat` → open the bot persona popup (no network call), passing the bot's real
  difficulty. Note: `PlayScreen` doesn't currently select `botDifficulty` out of the store — add a
  `useGame((s) => s.botDifficulty)` selector next to the existing `botSeat` one.
- `isLocal` → open the hotseat character popup for that seat's synthesized identity (no
  network call).
- otherwise, if `profile` is non-null (a real claimed seat) → open the real-profile popup, which
  triggers `getPlayerProfile(gameId, cardSeat)`.
- an unclaimed "Waiting for opponent…" seat stays non-interactive (nothing to show).

## Verification

- Backend: `dotnet test Khet.slnx` — new/updated tests for `ApplyEloAsync` (wins/losses increment
  correctly for both categories and both winner/loser sides) and the new
  `GET /api/games/{id}/players/{seat}` endpoint (200 for a claimed seat, 404 for bot/unclaimed,
  correct shape, spectator access allowed). Backend-touching DB tests go in `api.tests/Api/`
  tagged `Integration`, per house style.
- Frontend: `npm run lint && npm run test && npm run build` from `/web`; new tests for
  `RatingBadges`, the popup's three variants, and `PlayerCard`'s click wiring.
- Manual: run the app (`npm run dev` + API), start a bot game and click the bot's card (persona +
  difficulty), start a hotseat Local Play game and click both cards (character bios), and play a
  real match between two accounts to confirm the real-profile popup fetches and renders correctly,
  including for a spectator.
