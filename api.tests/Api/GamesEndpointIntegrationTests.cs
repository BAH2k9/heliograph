namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed endpoint tests. Deferred to the frontend milestone (see the plan): they need a
/// throwaway Postgres (Testcontainers or a CI service) plus WebApplicationFactory, and a
/// change to ci.yml. Kept here as a checklist so the coverage isn't forgotten.
///
/// TODO(next milestone):
///  - POST /api/games writes one Games row with a jsonb State holding the 24-piece layout.
///  - GET  /api/games/{id} returns the current State; unknown id -> 404.
///  - POST /api/games/{id}/moves appends exactly one Moves row, overwrites State, increments
///    MoveCount, flips CurrentTurn, and keeps exactly ONE board snapshot (on Games.State).
///  - An illegal move -> 400 { error } and persists nothing (no Moves row, MoveCount unchanged).
///  - A move on a finished game -> 409.
///  - A winning move sets Status and leaves CurrentTurn on the winner.
///  - Move.LaserResult jsonb round-trips with segment order preserved.
/// </summary>
public class GamesEndpointIntegrationTests
{
    [Fact(Skip = "Integration tests land in the frontend milestone — needs Postgres + WebApplicationFactory + ci.yml change.")]
    [Trait("Category", "Integration")]
    public void Placeholder()
    {
    }
}
