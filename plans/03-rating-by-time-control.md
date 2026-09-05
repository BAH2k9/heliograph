---
feature: rating-by-time-control
status: ready
depends_on: []
backend_branch: feat/rating-by-time-control-be
frontend_branch: feat/rating-by-time-control-fe
---

# Rating split by time-control category

## Why

`ApplicationUser` has one global `Rating`/`RatedGamesPlayed`. A 1+0 Bullet result and a 15+10 Rapid
result currently move the exact same number, which is meaningless — chess.com splits rating by time
control, and that's explicitly what's wanted here too.

## Owner decision already made (resolves an axis ambiguity found during planning)

Rating splits by **`TimeControlCategory` only** — Bullet / Blitz / Rapid / Daily (see
`api/Domain/TimeControl.cs`'s `TimeControlCategory` enum) — **not** by ruleset. A Classic result and
a Khet 2.0 result at the same time control feed the same category rating. This was deliberately
chosen over a per-ruleset split or a full ruleset×category matrix — narrower scope, matches
chess.com's own model, matches the literal ask ("elo ... for the specific time format"). Don't
revisit this; implement it as stated.

## Wire contract

- `UserProfile` (`api/Contracts/AuthApi.cs`) drops `Rating`/`RatedGamesPlayed`, gains:
  `IReadOnlyList<RatingBucket> Ratings` where `RatingBucket(string Category, int Rating, int
  GamesPlayed)`. **Always exactly 4 entries**, one per `TimeControlCategory` name
  (`"Bullet"`/`"Blitz"`/`"Rapid"`/`"Daily"`), even at the 1200/0 default. This shape is returned by
  `GET /api/auth/me` and embedded in every `AuthResponse` (register/login/refresh).
- `GET /api/leaderboard?category=Bullet|Blitz|Rapid|Daily` — `category` becomes **required**: 400
  `{ "error": "unknown time control category '...'" }` on missing/unrecognized value (there's no
  longer a single unqualified leaderboard). `LeaderboardEntry(Guid Id, string DisplayName, int
  Rating, int GamesPlayed)` keeps its existing flat shape — it's just resolved against whichever
  bucket `category` names.
  - **Clarification (backend implementation found this ambiguous):** "keeps its existing flat
    shape" means no field rename — the actual record stays `LeaderboardEntry(Guid UserId, string
    DisplayName, int Rating, int RatedGamesPlayed)` (`api/Contracts/GameApi.cs`), i.e. camelCase
    `{ userId, displayName, rating, ratedGamesPlayed }` on the wire. The `Id`/`GamesPlayed` names
    above were shorthand in this doc, not a rename instruction — only the new required `category`
    query param is new here.

## Backend scope

- Replace `ApplicationUser.Rating`/`RatedGamesPlayed` (`api/Domain/ApplicationUser.cs`) with 8
  explicit columns, one Rating+GamesPlayed pair per category: `BulletRating`/`BulletGamesPlayed`,
  `BlitzRating`/`BlitzGamesPlayed`, `RapidRating`/`RapidGamesPlayed`, `DailyRating`/
  `DailyGamesPlayed`. Additive columns, not a normalized ratings table — matches this codebase's
  established pattern (see `CLAUDE.md` and the `AddTimeControls` migration's own reasoning).
- New migration backfills all four new Rating columns from the existing single `Rating` value for
  every existing account (a one-time historical approximation — do **not** reset everyone to 1200),
  then drops the old `Rating`/`RatedGamesPlayed` columns.
- `GameService.ApplyEloAsync` (`api/Services/GameService.cs`) picks which column pair to read/write
  via `TimeControls.For(game.TimeControl!).Category`.
  - **Behavior change — call this out explicitly in the PR body, per this repo's "owner decision"
    commit convention:** an untimed rated game (`Game.TimeControl` null) now updates **no** rating
    bucket at all, since there's no category to attribute it to (matches chess.com, which has no
    rating for "no time control" either). Today it silently updates the single global `Rating`;
    after this change, `ApplyEloAsync` should just no-op for a null `TimeControl`. Flag this
    plainly, don't bury it.
- `LeaderboardService.GetTopAsync` (`api/Services/LeaderboardService.cs`) gains a
  `TimeControlCategory category` parameter, filters `WHERE <category>GamesPlayed > 0`, orders by
  that category's rating.
- Update every existing consumer of the old shape: `AuthController`, wherever `AuthApi.cs`'s
  `UserProfile` gets constructed, `api.tests/Api/GameEloIntegrationTests.cs`,
  `api.tests/Api/AuthEndpointIntegrationTests.cs`. `api.tests/Services/EloServiceTests.cs` should
  need no change — `EloService.Apply` is pure category-agnostic math; only the *wiring* around it
  (which bucket gets read/written) changes.

## Frontend scope

- `web/src/api/authTypes.ts` / `web/src/api/authClient.ts` / `web/src/authStore.ts`: replace
  `rating`/`ratedGamesPlayed` with `ratings: RatingBucket[]` throughout.
- `web/src/pages/ProfilePage.tsx`: replace the single "Rating: 1200 · N rated games" line with 4
  badges, one per category — reuse existing badge styling patterns already in this file/nearby
  components (e.g. the amber `Rated` badge) rather than inventing a new visual language.
- `web/src/pages/LeaderboardPage.tsx`: add category tabs/select (Bullet/Blitz/Rapid/Daily),
  refetching `?category=...` on change; default to Blitz on first load.

## Tests

- Update `api.tests/Api/GameEloIntegrationTests.cs` to assert the *correct* category bucket moves
  after a rated game finishes, and that the other three buckets are untouched.
- Update `api.tests/Api/AuthEndpointIntegrationTests.cs` for the new `Ratings` list shape on
  register/login/refresh/me.
- Add a migration-backfill assertion: check `api.tests/Persistence/` for an existing precedent for
  testing a migration's data effect; if none exists, a plain integration test creating an account
  with the pre-migration single `Rating` value (or just asserting a fresh account's 4 buckets all
  start at 1200/0) is enough — don't over-build a migration-testing harness for this.

## Out of scope

- Per-ruleset rating (explicitly ruled out above — don't add a Classic/Khet 2.0 split on top of the
  category split).
- A "peak rating" or rating-history graph — future polish, not this plan.
- Recomputing historical per-category ratings from past game records — the migration is a flat
  backfill (copy the single old value into all four buckets), not a replay of game history.

## Owner decisions already made

(See the dedicated section above — category-only split, not ruleset, not a matrix.)

## If blocked

Edit this file's frontmatter to `status: blocked` plus a one-line `blocker:` if something genuinely
ambiguous comes up beyond what's resolved above; stop without opening a PR. Ordinary implementation
judgment calls are yours — don't block on those.
