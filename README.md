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

No Docker needed locally — the database runs remotely; point the API at it via a connection string.

**Backend:**
```
cd api
dotnet run
```
Runs on `http://localhost:5065`. Set `ConnectionStrings:KhetDb` in `appsettings.Development.json` (or via `dotnet user-secrets` / env var) to point at a reachable Postgres instance, then apply migrations:
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
cd api.tests
dotnet test
```

## Deployment

`docker-compose.yml` builds and runs the full stack (`db`, `api`, `web`, `caddy`) — intended to run on a server, not locally. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, then:
```
docker compose up -d --build
```
