# Heliograph

Heliograph is a two-player strategy game of mirrors and light, played in the browser. Each side
moves and turns its pieces to bend a beam of sunlight across the board. After every move the
mover's beam fires, and whoever's Keep it strikes loses the game.

It's built as a real deployed web app rather than a desktop prototype. You can play hot-seat on one
device, against a bot, or online against a friend (rated or casual, with or without a clock), and
it installs as a PWA.

Two rulesets are offered:
- **Fixed Sun:** the beams fire from fixed corners, and Bastions can be stacked and split.
- **Turning Sun:** each corner holds a Heliostat you can turn as your move, and Sentinels take the
  place of Bastions.

There are three starting setups: Dawn, Zenith and Dusk.

## Stack

| Layer | Choice |
|---|---|
| Backend | C# / ASP.NET Core Web API, SignalR for realtime |
| Frontend | React + TypeScript + Tailwind CSS (Vite), Framer Motion for animation, installable as a PWA |
| Database | PostgreSQL via EF Core |
| Deployment | Docker Compose (API + web + Postgres + Caddy reverse proxy) |

## Layout

The .NET solution and project names below are the current on-disk names.

```
/backend
  Heliograph.slnx            solution file
  /api                ASP.NET Core Web API (Heliograph.Api)
  /api.tests          xUnit tests
  /Heliograph.Engine, /Heliograph.Clock, /Heliograph.Contracts   pure BCL-only libraries (+ their .Tests projects)
/web                  React + Vite frontend
/infra
  docker-compose.yml   deployment stack
  Caddyfile            reverse proxy config
  deploy.sh            pull + rebuild + restart on the deploy box
  .env.example         the two secrets the stack reads (copy to .env)
/docs                 architecture docs, backlog, bug queue
```

## Local development

The database runs locally in Docker, and the API and web run natively.

**Database:**
```
cd infra
cp .env.example .env      # set POSTGRES_PASSWORD and JWT_SIGNING_KEY to any local values
docker compose up -d db   # postgres:16 on localhost:5432
```

**Backend:**
```
cd backend/api
dotnet run
```
It runs on `http://localhost:5065`. Point `ConnectionStrings:KhetDb` at the local DB with `dotnet user-secrets` (or an env var):
```
dotnet user-secrets set "ConnectionStrings:KhetDb" "Host=localhost;Port=5432;Database=khet;Username=khet;Password=<your .env value>"
```
The committed `appsettings.*.json` files keep `CHANGEME` placeholders, and real values never go in git. Then apply the migrations:
```
dotnet ef database update
```

**Frontend:**
```
cd web
npm install
npm run dev
```
It runs on `http://localhost:5173` and proxies `/api/*` (including the SignalR hub's WebSocket) to the backend.

**Tests:**
```
dotnet test backend/Heliograph.slnx
cd web && npm run lint && npm run test && npm run build
```
Most backend tests are pure (the game engine and clock, plus jsonb round-trips). The DB-backed
endpoint tests (`backend/api.tests/Api/`, `[Trait("Category","Integration")]`) run the API against a
throwaway Postgres. CI provides a `postgres:16` service. Locally they use the dev Docker DB on a
separate `khet_test` database, and they skip if no Postgres is reachable. Point them elsewhere with
the `KHET_TEST_DB` connection-string env var.

## Game API

The core routes. See `backend/api/Controllers/` for the rest (bots, rooms, invites, rematches,
resign and clock claims).

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/games` | Create a game. The optional body `{ "ruleset", "layout" }` picks the rules and the starting setup; the default is Fixed Sun on Dawn. P1 moves first. |
| `GET` | `/api/games/{id}` | Current board, status, and whose turn it is. |
| `POST` | `/api/games/{id}/moves` | Body `{ "type": "move"\|"rotate"\|"stack"\|"unstack", "from": {row,col}, "to"?: {row,col}, "rotation"?: "CW"\|"CCW" }`. `stack`/`unstack` are Fixed Sun only. Validates and applies the move, fires the mover's beam, and returns the new board, the ordered `laserSegments`, and any `eliminated`/`damaged` pieces. An illegal move → `400 { "error": "..." }`; a move on a finished game → `409`. |

The rules live in the standalone `Heliograph.Engine` project as a pure library (no EF/DI/async, no non-BCL
dependencies). The request/response shapes live in `Heliograph.Contracts`, and the clock arithmetic in
`Heliograph.Clock`. All three are BCL-only.

See `backend/api/Heliograph.Api.http` for a ready-to-run request sequence.

## Deployment

`infra/docker-compose.yml` builds and runs the full stack (`db`, `api`, `web`, `caddy`). It's intended to run on a server, not locally, and all four services run on one Docker host. Caddy publishes `:80` and path-routes `/api/*` to the API and everything else to the static frontend. TLS and a DNS name are handled by a reverse proxy or tunnel in front, not by this stack. Caddy also sits on a small `edge` network of its own, reserved for that tunnel connector.

From `infra/`, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` and `JWT_SIGNING_KEY`, then run:
```
docker compose up -d --build
```
The API applies EF migrations on startup when `ASPNETCORE_ENVIRONMENT=Production` (the default in the container).

On the deployment box, which holds a checkout of this repo tracking `main`, run `./deploy.sh` from its `infra/` directory. That pulls, rebuilds and restarts the stack.

### The deployment host

The box is an **unprivileged** Proxmox LXC (Debian 12) running real Docker CE. Getting `docker-ce`
(not just `docker.io`) working in an unprivileged LXC on this Proxmox version needs all three of these:
- `nesting=1` and `keyctl=1`, both set as `features: nesting=1,keyctl=1`
- `lxc.apparmor.profile: unconfined`, set by editing `/etc/pve/lxc/<id>.conf` directly, because
  `pct set` doesn't expose it

`nesting` + `keyctl` alone isn't enough. `onboot: 1` is set so the container survives a host reboot.
Credentials (the secrets in `infra/.env` on the box, and the DB connection string) live only on the
box and in the maintainer's own notes, never in git.
