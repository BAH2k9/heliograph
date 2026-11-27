# Heliograph: ideas

Ideas and backlog that aren't tickets yet. One `##` heading per idea, then a `status:` line:
`idea` · `planned #<ticket>` · `dropped YYYY-MM-DD` · `done YYYY-MM-DD #<ticket>`. The date is the day it closed.
Starting an idea adds a row to the `status.md` Tracker and marks the idea `planned` with that ticket number.
`dropped` exists on ideas only. At session end, ideas dropped or done 30+ days ago move to
`docs/archive/ideas.md` (same format).

<!-- One block per idea:
## Short title
status: idea
One or two lines: what, and why it might be worth doing.
-->

## Shareable replay links to a single move
status: idea
`web/src/pages/ReplayScreen.tsx` keeps `step` in local state and always opens on the last move, so you can't send someone "look at move 14". Read and write `?step=N` with `useSearchParams` and add a "Copy link to this move" button. Archive rows in `GameArchivePage.tsx` could then link straight to the decisive ply. Size: S. (auto 2026-11-26-2042)

## Threat overlay: where the opponent's beam goes next
status: idea
A display setting (in `web/src/settings/` and `DisplaySettingsPanel.tsx`) that draws a faint trace of the opponent's beam as the board stands, using the existing client mirror in `web/src/game/laser.ts`/`rules.ts` and `LaserLayer.tsx`. Players would see a hanging Keep before they commit. It's UX-only, so the server stays the referee. Size: M. (auto 2026-11-26-2042)

## Serve the preset registries from the API and delete the hand-kept TS copies
status: idea
`web/src/game/timeControls.ts` and `gamePresets.ts` copy `TimeControls`/`RuleSets`/`BoardLayouts` by hand, and `web/CLAUDE.md` marks keeping them in sync as unenforced. A cacheable `GET /api/presets` (built from the registries in `Heliograph.Clock`/`Heliograph.Engine`, with DTOs in `Heliograph.Contracts`) would let the frontend drop both files and the rule that guards them. Size: M. (auto 2026-11-26-2042)

## One helper for the `user:{id}` SignalR group name
status: done 2026-11-26 (auto/overnight-2026-11-26-2042, fix lane; no ticket)
`$"user:{id}"` is built inline in four places: `Hubs/GameHub.cs`, `Controllers/InvitesController.cs` (twice) and `Controllers/FriendsController.cs`. Add a single `UserGroup.For(userId)` next to `GameHub` and use it everywhere, which retires the stringly-typed-group trap in `.claude/context/GOTCHAS.md`. Size: S. (auto 2026-11-26-2042)

## Golden engine fixtures shared by the C# tests and the TS mirror
status: idea
The client mirror's parity with `Heliograph.Engine` rests on hand-written "Parity with GameEngine.X" comments in `web/src/game/rules.test.ts`. A small generator in `Heliograph.Engine.Tests` could write JSON fixtures (a position, its legal moves, its laser path and outcome). `web/src/game/{rules,laser}.test.ts` would then assert against the same files, so mirror drift fails CI instead of slipping through silently. Size: M. (auto 2026-11-26-2042)

## Let the compiler check `<see cref>` in the API project
status: done 2026-11-26 (auto/overnight-2026-11-26-2042, fix lane; no ticket)
`Heliograph.Engine.csproj` already sets `GenerateDocumentationFile`, but `backend/api/Heliograph.Api.csproj` doesn't, which is why crefs rot there (GOTCHAS, "`<see cref>` doc references are not compiler-checked"). Turn it on, add `NoWarn` for CS1591 and `WarningsAsErrors` for CS1574/CS1584, fix whatever breaks, and delete the GOTCHAS entry. Size: S. (auto 2026-11-26-2042)
