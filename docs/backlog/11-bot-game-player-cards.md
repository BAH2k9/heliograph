---
feature: bot-game-player-cards
status: done
depends_on: [08-bot-opponent, 09-player-info-popup]
backend_branch: null
frontend_branch: feat/bot-game-player-cards
---

# Fix: bot-game player cards show "Guest" instead of real identities

## Context

Bug report: playing against the bot, both `PlayerCard`s (the name/avatar/rating strip above the
board) show "Guest" instead of the signed-in user's real account and the bot's persona.

Traced root cause (no code changed yet — this ticket is the write-up, not the fix):

- `backend/api/Services/GameService.Bot.cs`'s `CreateBotGameAsync` creates bot games **by design**
  anonymous/unrated — `Game.P1UserId`/`P2UserId` are never set (per `08-bot-opponent.md`: "Bot
  games are always unrated and anonymous"). This is a deliberate, already-made owner decision —
  **do not** re-litigate it or set those columns to fix this bug.
- Because of that, `GameResponseMapper.ToResponseAsync`
  (`backend/api/Services/GameResponseMapper.cs:32-44`) always returns `p1Profile: null` and
  `p2Profile: null` for a bot game — there's no account row to join against for either seat.
- Client-side, `web/src/store.ts`'s `newBotGame` (`store.ts:628-659`) just copies
  `g.p1Profile`/`g.p2Profile` straight from the (always-null) server response into the store.
  Compare `newGame` (local play, `store.ts:589-626`), which **does** synthesize client-side
  `p1Profile`/`p2Profile` (`pickLocalPlayerIdentities()`) precisely so `PlayerCard` doesn't fall
  back to "Guest" — bot games never got the equivalent treatment.
- In `web/src/pages/PlayScreen.tsx`, `playerCard()` (`PlayScreen.tsx:79-92`) passes
  `profile={cardSeat === 'P1' ? p1Profile : p2Profile}` unconditionally, straight from those
  always-null store fields. `PlayerCard.tsx:46`'s fallback then kicks in
  (`isYou ? 'Guest' : 'Waiting for opponent…'`), and since `mySeat` is null in a bot game (`seat`
  is never claimed — `PlayScreen.tsx:61`), `isYou` is `true` for **both** cards, so both read
  "Guest".
- Tellingly, the popup-target logic right next to it, `playerInfoTargetFor()`
  (`PlayScreen.tsx:65-77`), **already** special-cases `botSeat === cardSeat` to synthesize a
  `{ kind: 'bot', displayName, bio, difficulty }` target from `botPersonaFor()`
  (`web/src/components/botPersonas.ts`) for the click-through player-info dialog (`09`). That
  persona data exists and is correct — it's just never plumbed into the card's visible name/avatar,
  only into what opens when you click it. This strongly suggests the card-display path was simply
  missed when `09-player-info-popup.md` wired up the bot popup, not an intentional choice to leave
  the cards themselves anonymous.
- The signed-in human's own identity is available client-side regardless of the server response:
  `web/src/authStore.ts` holds the authenticated `UserProfile` (`displayName`, `avatarId`,
  `ratings: RatingBucket[]` — `web/src/api/authTypes.ts:19-37`) whenever the player isn't a guest.
  Bot games don't require auth (`08-bot-opponent.md`: "No auth required... bot games are always
  unrated/anonymous"), so a **guest** playing the bot genuinely has no account to show — "Guest" is
  the *correct* label for that case. The bug is specifically that a **signed-in** user playing the
  bot still sees "Guest" for themselves, and the bot always shows the generic fallback instead of
  its persona name.

This is purely a display bug — no wire contract or backend change is needed, since everything
required (the user's own profile, the bot's persona) is already available client-side. The fix
belongs in `/web` only; no `backend_branch`.

## Owner decisions already made (carry over from `08`, do not re-litigate)

- Bot games stay unrated/anonymous **on the wire** — `Game.P1UserId`/`P2UserId` must **not** be set
  server-side to fix this. This is a display-only fix, sourced from client-side auth state + the
  existing bot-persona pool.
- A guest (unauthenticated) player vs. the bot correctly still shows "Guest" for their own seat —
  there's no account to show. Don't add a fake identity for guests.

## Proposed shape

Not prescribing exact code — this is a ticket, not an implementation — but the pattern to mirror is
already in the codebase:

- `web/src/pages/PlayScreen.tsx`'s `playerCard()` should build a display-only, `PlayerSummary`-shaped
  value per seat instead of passing `p1Profile`/`p2Profile` straight through, the same way `newGame`
  synthesizes identities for local play (`store.ts:596-599`, `pickLocalPlayerIdentities()`):
  - **Bot seat** (`botSeat === cardSeat`): use `botPersonaFor(gameId ?? cardSeat)` (already computed
    in `playerInfoTargetFor` — reuse rather than recompute) for the display name. No `avatarId`
    (`Avatar` already falls back to the initial letter with none — `web/src/components/Avatar.tsx:45-56`)
    and no meaningful rating.
  - **Human seat** (the non-bot seat, when authenticated): use `authStore`'s `UserProfile`
    (`displayName`, `avatarId`) rather than the store's `p1Profile`/`p2Profile`. A rating to show
    would need picking one `RatingBucket` category — likely `Untimed` (bot games are always
    untimed, per `08`), consistent with `GameResponseMapper.ToPlayerSummary`'s existing "untimed
    game → `Untimed` bucket" rule (`GameResponseMapper.cs:60-70`) even though that mapper itself
    isn't invoked here.
  - **Human seat, guest** (unauthenticated): keep the existing "Guest" fallback — correct as-is.
  - `showRating` currently gates on `!isLocal` (`PlayScreen.tsx:88`); a bot game is not "local" in
    that boolean's sense but the bot seat still has nothing to rate, so the bot seat specifically
    may need its own `showRating` override regardless of what `PlayerCard`'s existing prop does for
    the human seat.

## Out of scope

- Anything server-side (`Game.P1UserId`/`P2UserId`, `GameResponseMapper`) — must stay null/anonymous
  for bot games.
- Rating/leaderboard visibility for bot games — still N/A, per `08-bot-opponent.md`.
- Guest-vs-bot behavior — "Guest" for an unauthenticated player is correct, not part of this bug.

## Reference files

- `web/src/pages/PlayScreen.tsx` — `playerCard()`, `playerInfoTargetFor()`
- `web/src/store.ts` — `newBotGame`, `newGame` (pattern to mirror)
- `web/src/components/botPersonas.ts` — `botPersonaFor()`
- `web/src/components/PlayerCard.tsx` — the "Guest"/"Waiting for opponent…" fallback (line 46)
- `web/src/authStore.ts`, `web/src/api/authTypes.ts` (`UserProfile`, `RatingBucket`)
- `backend/api/Services/GameService.Bot.cs`, `backend/api/Services/GameResponseMapper.cs` — why the
  server-side profiles are (and should remain) null for bot games

## Verification

- Frontend: `npm run lint && npm run test && npm run build` from `/web`; add/extend a
  `PlayScreen`/`PlayerCard` test covering a signed-in user vs. bot (both cards show real identities)
  and a guest vs. bot (human side still shows "Guest", bot side still shows its persona).
- Manual: run the app (`npm run dev` + API), sign in, start a bot game, confirm your own card shows
  your real name/avatar and the bot's card shows its persona name (not "Guest"/"Waiting for
  opponent…"); repeat as a guest to confirm "Guest" still shows correctly for the human seat.
