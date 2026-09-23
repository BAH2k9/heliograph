# Archify diagram brief — Khet-Web

Purpose: produce interactive, source-grounded architecture/sequence diagrams of this repo using the **Archify** skill (https://github.com/tt-a1i/archify). This doc is the brief for whichever agent runs the generation — it does not contain the diagrams themselves.

## 0. Prerequisite — install the skill

Archify is not currently installed in this repo or globally on this machine. Before generating anything, install it as a Claude Code skill:

```bash
npx skills add tt-a1i/archify -g
```

(Global install is fine — it's not repo-specific. Use `--project` instead of `-g` if you'd rather scope it to `Khet-Web/.claude/skills`.)

Verify with:

```bash
node <path-to-archify>/archify/bin/archify.mjs doctor
```

## 1. Repo shape (for scoping the diagram, not to be copied verbatim — verify against source)

- `backend/api/` — ASP.NET Core backend. `Controllers/`, `Hubs/` (SignalR realtime), `Auth/`, `Domain/`, `Persistence/`, `Services/`, `Data/`.
- `web/` — React + Vite + TypeScript frontend, PWA (`pwa.config.ts`).
- `mobile/` — Expo/React Native client.
- `Heliograph.Engine` — core game rules engine (board, moves, laser, legal-move generation) — pure C#, no I/O.
- `Heliograph.Contracts` — shared DTOs/API contracts between `api` and clients (`GameApi`, `AuthApi`, `FriendsApi`, `AdminApi`, `BoardState`).
- `Heliograph.Clock` — chess-clock/time-control logic, used by the engine/api.
- Deployment: `Dockerfile`s in `backend/api/` and `web/`, `infra/docker-compose.yml`, `infra/Caddyfile` (reverse proxy), `deploy.sh`.

## 2. What to generate

### Primary: `architecture` diagram — runtime system map
Prompt to give the agent (adjust after it reads real source):

> Analyze this repository, then use archify to create a high-level runtime architecture diagram.
> Show 8–12 core components: web client, mobile client, the API (with its SignalR hub for realtime game state), the game engine, the database/persistence layer, auth, and the Caddy reverse proxy / deployment boundary.
> One primary path: client → API → engine → persistence, plus the realtime SignalR path for live game updates.
> Put supporting detail (auth provider, background services, docker boundary) in cards instead of adding more edges.
> Use `meta.quality_profile: "showcase"`.

### Optional: `sequence` diagram — one game move
Useful for showing an actual turn round-trip (client moves a piece → API validates via `Heliograph.Engine` → laser/win check → SignalR broadcast → both clients update). Only generate if the architecture diagram alone doesn't communicate the realtime flow clearly.

### Optional: `dataflow` diagram — persistence/auth
Only if there's a distinct story around what data is stored/synced (match history, ratings, friend invites) worth separating from the architecture view.

Don't generate all three by default — start with `architecture`, and only add `sequence`/`dataflow` if the user asks for more detail after seeing it.

## 3. Validation and delivery (required — do not skip)

```bash
node bin/archify.mjs validate architecture <candidate.json> --quality showcase --json
node bin/archify.mjs deliver architecture <candidate.json> <output.html> --quality showcase --json
```

A showcase pass requires all 9 artifact checks, 0 composition errors, 0 warnings. Never hand back a candidate that failed validation.

## 4. Output location

Save the delivered HTML under `Khet-Web/docs/` (e.g. `docs/khet-web.architecture.html`) so it's checked into the repo alongside this brief, unless the user asks for it elsewhere.
