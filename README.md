# Khet — Web Rebuild

A web-based multiplayer rebuild of [Khet](https://en.wikipedia.org/wiki/Khet_(game)), the laser-reflection board game — backend-first, built as a real deployed artifact rather than another desktop prototype.

## Stack

| Layer | Choice |
|---|---|
| Backend | C# / ASP.NET Core Web API |
| Frontend | React + TypeScript + Tailwind CSS (Vite), Framer Motion for animation |
| Database | PostgreSQL |
| Deployment | Docker Compose (API + web + Postgres + Caddy reverse proxy) |

## Layout

```
/backend
  Khet.slnx            solution file
  /api                ASP.NET Core Web API (Khet.Api)
  /api.tests          xUnit tests
  /Khet.Engine, /Khet.Clock, /Khet.Contracts   pure BCL-only libraries (+ their .Tests projects)
/web                  React + Vite frontend
/infra
  docker-compose.yml   deployment stack
  Caddyfile            reverse proxy config
  deploy.sh            pull + rebuild + restart on the deploy box
/docs                 architecture docs, backlog, bug queue
```

## Local development

The database runs locally in Docker; the API and web run natively.

**Database:**
```
cd infra
cp .env.example .env      # set POSTGRES_PASSWORD to any local value
docker compose up -d db   # postgres:16 on localhost:5432
```

**Backend:**
```
cd backend/api
dotnet run
```
Runs on `http://localhost:5065`. Point `ConnectionStrings:KhetDb` at the local DB via `dotnet user-secrets` (or env var):
```
dotnet user-secrets set "ConnectionStrings:KhetDb" "Host=localhost;Port=5432;Database=khet;Username=khet;Password=<your .env value>"
```
(The committed `appsettings.*.json` keep `CHANGEME` placeholders — real values never go in git.) Then apply migrations:
```
dotnet ef database update
```

**Frontend:**
```
cd web
npm install
npm run dev
```
Runs on `http://localhost:5173` and proxies `/api/*` to the backend.

**Tests:**
```
dotnet test backend/Khet.slnx
```
Most backend tests are pure (the game engine, plus jsonb round-trips). The DB-backed
endpoint tests (`backend/api.tests/Api/`, `[Trait("Category","Integration")]`) run the API against a
throwaway Postgres — CI provides a `postgres:16` service; locally they use the dev Docker DB on
a separate `khet_test` database, and skip if no Postgres is reachable. Point them elsewhere with
the `KHET_TEST_DB` connection-string env var.

## Game API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/games` | Create a game in the Classic opening position (P1 to move). |
| `GET` | `/api/games/{id}` | Current board, status, and whose turn it is. |
| `POST` | `/api/games/{id}/moves` | Body `{ "type": "move"\|"rotate"\|"stack"\|"unstack", "from": {row,col}, "to"?: {row,col}, "rotation"?: "CW"\|"CCW" }` (`stack`/`unstack` are Classic-ruleset only). Validates and applies the move, auto-fires the mover's laser, and returns the new board, the ordered `laserSegments`, and any `eliminated`/`damaged` pieces. Illegal move → `400 { "error": "..." }`; move on a finished game → `409`. |

The rules live in the standalone `Khet.Engine` project as a pure library (no EF/DI/async, no non-BCL
dependencies); the request/response shapes live in `Khet.Contracts`, and the clock arithmetic in
`Khet.Clock` — all three BCL-only.

See `backend/api/Khet.Api.http` for a ready-to-run request sequence.

## Deployment

`infra/docker-compose.yml` builds and runs the full stack (`db`, `api`, `web`, `caddy`) — intended to run on a server, not locally. All four services run on one Docker host. Caddy publishes `:80` and path-routes `/api/*` to the API, everything else to the static frontend; TLS / a DNS name are handled by a reverse proxy in front, not by this stack.

From `infra/`, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, then:
```
docker compose up -d --build
```
The API applies EF migrations on startup when `ASPNETCORE_ENVIRONMENT=Production` (the default in the container).

On the deployment box (`/opt/khet`, a checkout of this repo), `infra/deploy.sh` wraps pull + rebuild + restart:
```
ssh khet 'cd /opt/khet/infra && ./deploy.sh'
```

### The deployment host

The box is an **unprivileged** Proxmox LXC (Debian 12) running real Docker CE. Getting `docker-ce`
(not just `docker.io`) working in an unprivileged LXC on this Proxmox version needs all three of:
`features: nesting=1,keyctl=1` **and** `lxc.apparmor.profile: unconfined` (set by editing
`/etc/pve/lxc/<id>.conf` directly — `pct set` doesn't expose it). `nesting` + `keyctl` alone is not
enough. `onboot: 1` so it survives a host reboot. Credentials (the `POSTGRES_PASSWORD` in
`/opt/khet/infra/.env`, the DB connection string) live only on the box and in the maintainer's own notes,
never in git.
