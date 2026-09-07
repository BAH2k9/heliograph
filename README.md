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
/api      ASP.NET Core Web API (Khet.Api)
/api.tests    xUnit tests
/web      React + Vite frontend
docker-compose.yml   deployment stack
Caddyfile             reverse proxy config
```

## Local development

The database runs locally in Docker; the API and web run natively.

**Database:**
```
cp .env.example .env      # set POSTGRES_PASSWORD to any local value
docker compose up -d db   # postgres:16 on localhost:5432
```

**Backend:**
```
cd api
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
dotnet test Khet.slnx
```
Most backend tests are pure (the game engine, plus jsonb round-trips). The DB-backed
endpoint tests (`api.tests/Api/`, `[Trait("Category","Integration")]`) run the API against a
throwaway Postgres — CI provides a `postgres:16` service; locally they use the dev Docker DB on
a separate `khet_test` database, and skip if no Postgres is reachable. Point them elsewhere with
the `KHET_TEST_DB` connection-string env var.

## Game API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/games` | Create a game in the Classic opening position (P1 to move). |
| `GET` | `/api/games/{id}` | Current board, status, and whose turn it is. |
| `POST` | `/api/games/{id}/moves` | Body `{ "type": "move"\|"rotate", "from": {row,col}, "to"?: {row,col}, "rotation"?: "CW"\|"CCW" }`. Validates and applies the move, auto-fires the mover's laser, and returns the new board, the ordered `laserSegments`, and any `eliminated`/`damaged` pieces. Illegal move → `400 { "error": "..." }`; move on a finished game → `409`. |

The rules live in the standalone `Khet.Engine` project as a pure library (no EF/DI/async, no non-BCL
dependencies).

See `api/Khet.Api.http` for a ready-to-run request sequence.

## Deployment

`docker-compose.yml` builds and runs the full stack (`db`, `api`, `web`, `caddy`) — intended to run on a server, not locally. All four services run on one Docker host. Caddy publishes `:80` and path-routes `/api/*` to the API, everything else to the static frontend; TLS / a DNS name are handled by a reverse proxy in front, not by this stack.

Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, then:
```
docker compose up -d --build
```
The API applies EF migrations on startup when `ASPNETCORE_ENVIRONMENT=Production` (the default in the container).

On the deployment box (`/opt/khet`, a checkout of this repo), `./deploy.sh` wraps pull + rebuild + restart:
```
ssh khet 'cd /opt/khet && ./deploy.sh'
```
