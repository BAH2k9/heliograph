---
name: khet-test-db
description: Stand up a throwaway Postgres container mirroring this repo's CI, then run the .NET test suite against it. Use only when specifically debugging a DB-related failure or reproducing an Integration-tagged test locally — not as a routine pre-PR step (CI's own Postgres service container is the authoritative place those tests run; see CLAUDE.md's "Three layers of testing").
user-invocable: true
---

# khet-test-db — ephemeral Postgres + backend test run, for targeted debugging only

**Not a routine pre-PR step.** Per the root `CLAUDE.md`'s "Three layers of testing," local/pre-PR
verification is unit + component tests only (`dotnet test backend/Khet.slnx` with no `KHET_TEST_DB` set —
`Integration`-tagged tests skipping is expected there). CI already runs the same throwaway
Postgres this skill stands up. Reach for this skill only when you're specifically debugging a
DB-related failure or need to reproduce an `Integration`-tagged test locally — not to "check a
backend change is CI-green" before opening a PR.

## Don't reach for the home LAN database

Local dev on the owner's machine normally points at a real Postgres on `192.168.0.20`.
**Never attempt to reach that address from an agent environment** — it's a private LAN
IP, not reachable from a sandbox or cloud run, and a "connection refused" there is
expected, not a bug to chase (see `GOTCHAS.md`'s ARP-cache entry, which is about that
same host and is irrelevant here). If you can't tell whether you're on the home LAN,
assume you aren't and use the steps below instead.

## Steps

1. Check Docker is available: `docker info` (quick, non-interactive). If it fails, skip
   to "No Docker available" below — this is an accepted fallback, not a blocker.
2. Start the same container CI uses (`.github/workflows/ci.yml`):
   ```
   docker run -d --name khet-test-db -e POSTGRES_USER=khet -e POSTGRES_PASSWORD=khet \
     -e POSTGRES_DB=khet_test -p 5432:5432 postgres:16
   ```
   If a container named `khet-test-db` already exists and is running, reuse it instead
   of starting a second one.
3. Wait for it to accept connections (a short poll loop against `pg_isready` or just a
   couple of retries on the test run below — don't sleep blindly for a fixed long
   duration).
4. Set the connection string and run the full suite from the repo root:
   ```
   KHET_TEST_DB="Host=127.0.0.1;Port=5432;Database=khet_test;Username=khet;Password=khet" dotnet test backend/Khet.slnx
   ```
   (PowerShell: `$env:KHET_TEST_DB = "..."` on its own line first, then `dotnet test backend/Khet.slnx`.)
5. Report whether the `[Trait("Category","Integration")]` tests in `backend/api.tests/Api/`
   actually ran or skipped — a run where they skip has not exercised the HTTP/EF/SignalR
   layer at all, and that must be stated plainly to whoever reads the result, not implied
   by a green summary.
6. Leave the container running for follow-up test runs in the same session; only
   `docker rm -f khet-test-db` it if the user asks you to clean up.

## No Docker available

That's an accepted fallback, not a blocker. Run `dotnet test backend/Khet.slnx` without
`KHET_TEST_DB` set — the integration tests will skip (not fail). Say so explicitly in
your report (e.g. "Integration tests skipped — no Postgres reachable in this
environment") rather than treating a skip-only green run as fully verified.
