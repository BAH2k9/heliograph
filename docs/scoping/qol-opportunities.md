# Quality-of-life scan: what's missing

Found while scanning `/api` and `/web` for the friend-invite scoping pass (see
`docs/scoping/friend-invites.md`). Ordered roughly by impact. Every "confirmed absent" claim below
is from an actual grep sweep across `api/` and `web/src`, not a guess from a directory listing.

## 1. No random/ranked matchmaking queue at all — biggest gap given how much rating machinery exists

The app has a full Elo system (`EloService`), four per-time-control rating buckets on every
account (`ApplicationUser.cs:47-57`), and a leaderboard page — but the *only* way to start a rated
game today is `RoomsController`: create a room, hand the code to a specific other person, both of
you happen to be logged in when you do it (`RoomService.JoinRoomAsync`'s `Rated` flip requires both
seats to already be account-holders at join time). There is no "find me any opponent near my
rating" queue anywhere (confirmed absent by grep across `api/` and `web/src` for
matchmaking/queue-related code — the few textual hits were unrelated fetch-queue/array code).

For a game that tracks Bullet/Blitz/Rapid/Daily ratings this seriously, this is the standout
missing feature — most players' actual want ("let me just play someone now") isn't served by
"share a link with a specific person." Likely bigger in scope than friend-invites: needs a queue
join/leave endpoint, a matching strategy (rating-band widening over wait time is the standard
approach), and a way to notify a matched pair — which runs into the exact same "no user-scoped hub
channel" gap the friend-invite doc flags.

## 2. ~~Rematch is disabled for room games~~ — done

Was: `WinOverlay.tsx`'s "Play again" silently demoted a room game to Local Play instead of
rematching the actual opponent. Fixed via `RoomService.RequestRematchAsync`/`DeclineRematchAsync`
(`POST /api/games/{id}/rematch[/decline]`) — a chess.com-style propose/match flow (each seat's own
"Play again" click is both its request and, once the other side has already asked, its consent;
no separate accept step), seats swap on the new room, and `RematchOfferBanner` shows the
"opponent wants a rematch" prompt for the seat that hasn't asked yet.

## 3. No draw offer

Confirmed absent by grep (no "draw offer"/"offerDraw" anywhere in `api/` or `web/src`). Right now
a game only ends via win, resignation, or timeout/abandonment
(`GameEndService`/`GameService.Endings.cs`). Khet games can plausibly stalemate or reach a dead
position neither side can convert; without a draw offer, one player's only exit is resigning
(taking the loss) or letting the clock run out. Small, self-contained addition following the same
"claim"-adjacent shape as resignation (an offer + an accept, both simple REST actions — no clock
claim semantics needed since it's not time-based).

## 4. No in-game chat or reactions

Confirmed absent by grep. Even a minimal preset-message ("good game", "well played") or emoji
reaction channel is common in web board-game apps and is cheap to add on the existing per-game hub
group (`GameHub`'s `gameId` group already exists — this doesn't need the user-scoped group the
matchmaking/invite features do). Lowest-effort item on this list if the owner wants any social
layer at all before tackling friends/matchmaking.

## 5. No takeback/undo request

Confirmed absent by grep. Common in casual (unrated) online board games as an opponent-consent
action — "may I take that back" / accept-decline, never unilateral. Would need care around the
clock (does declining cost the requester time?) and the `Move` history table, but is a bounded,
optional-scope feature; lower priority than the above since it's more contentious to get the rules
right on (should it be allowed in rated games at all?).

## 6. No bot/AI opponent for solo practice

Confirmed absent by grep. `createGame` (local/solo) exists purely for two people sharing one
screen/device (per `web/CLAUDE.md`: "local/solo games... are always untimed"), not for practicing
against the computer. Out of scope for a quick add (needs an actual engine-side move-picking
algorithm on top of `Khet.Engine`'s legality checking, not just a wiring change) but worth flagging
as a distinct, larger feature if the owner wants a way to learn/practice the ruleset solo.

## 7. No spectator-facing "who's watching" / live spectator count

`RoomsController`'s own doc comment confirms spectating already works (third+ joiner spectates),
but nothing surfaces who — or how many — spectators are present. Minor; only worth doing if
spectating turns out to matter to the owner's actual usage pattern.

## Not a QoL gap — just noting for completeness

**Push notifications for anything (invites, "your move" reminders, game-ended while away).** No
web push infrastructure exists at all today (confirmed absent by grep). Since `plans/05-pwa.md`
already made the app installable, this is a plausible next PWA step, but it's genuinely
feature-sized on its own — not a small addition riding on top of invites or matchmaking. Flagged
here so it's visible as a *separate* future decision rather than silently folded into either of the
two features above.
