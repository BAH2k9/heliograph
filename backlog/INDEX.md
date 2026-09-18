# Backlog index

Running status of every `backlog/*.md` item — title, one-line summary, status. This is a snapshot
for humans/agents to scan without opening every file; the frontmatter `status:` inside each item
is still the source of truth, so re-check it before trusting this table on anything stale-looking.
Update this file whenever a `status:` changes (new item added, `ready` → `in-progress`/`blocked`/
`done`, etc.) — see the pointers added to `khet-backlog-new`/`khet-backlog-work` below.

| # | Title | Summary | Status |
|---|---|---|---|
| [01](01-resignation.md) | Resignation | Lets a losing player concede instead of playing out a dead position or stalling the clock. | done |
| [02](02-disconnect-abandonment.md) | Disconnect / abandonment handling | Detects a vanished opponent and resolves the game, including the untimed-room case `claim-timeout` can't reach. | done |
| [03](03-rating-by-time-control.md) | Rating split by time-control category | Splits the single global Elo rating into per-time-control-category buckets (Bullet/Rapid/etc. no longer share one number). | done |
| [04](04-player-profile-board-identity.md) | Player profile & board identity | Adds an avatar picker and chess.com-style `PlayerCard` identity, building on the per-category ratings from #03. | done |
| [05](05-pwa.md) | Installable PWA (no app store) | Packages the already mobile-responsive site as an installable home-screen PWA on iOS/Android, no app store. | done |
| [06](06-friend-invites-friendships.md) | Friend invites — friendships (part 1 of 2) | Adds finding/adding/managing friends — the relationship layer a match-invite picker needs to exist first. | done |
| [07](07-friend-invites-matches.md) | Friend invites — match invites + real-time delivery (part 2 of 2) | Adds the actual "challenge a friend" flow on top of #06: configure a game, send an invite, real-time notify, join straight into a seated room. | done |
| [08](08-bot-opponent.md) | Bot opponent (play against the computer) | Adds a bot seat with selectable difficulty so a solo player can play a full game against server-side AI. | done |
| [09](09-player-info-popup.md) | In-game player info popup (friends, hotseat, and bot) | Makes `PlayerCard` clickable, showing a mini-profile, an in-universe bio, or an invented bot persona depending on what's in that seat. | done |
| [10](10-bug-traceability.md) | Bug traceability: correlation IDs + in-app bug report capture | Threads a correlation id through a game action's full lifecycle and adds an in-app "Report a bug" capture, to make hard-to-reproduce multiplayer bugs self-diagnosing. | done |
