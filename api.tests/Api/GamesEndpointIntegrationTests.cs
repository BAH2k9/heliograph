using System.Net;
using System.Net.Http.Json;
using Khet.Api.Contracts;
using Khet.Api.Data;
using Khet.Api.Domain;
using Khet.Api.Domain.Enums;
using Khet.Api.Engine;
using Khet.Api.Mapping;
using Khet.Api.Tests.Engine;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the games API: request in via HTTP, assertions out against the real
/// Postgres rows. Covers the persistence invariants that the pure engine tests can't —
/// one transaction per move, single board snapshot, illegal moves persisting nothing,
/// jsonb round-trip. Skips (doesn't fail) when no Postgres is reachable.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class GamesEndpointIntegrationTests(IntegrationFixture fixture)
{
    // A known-legal, uneventful P1 opening (see FullTurnTests): the piece at (2,3) slides to (2,4).
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(2, 3), new CoordDto(2, 4), null);

    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static KhetDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    private async Task<GameResponse> CreateGameAsync(HttpClient client)
    {
        var res = await client.PostAsync("/api/games", content: null);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = await res.Content.ReadFromJsonAsync<GameResponse>();
        Assert.NotNull(game);
        return game!;
    }

    [SkippableFact]
    public async Task Post_games_writes_one_row_with_the_classic_layout()
    {
        var client = NewClient();

        var game = await CreateGameAsync(client);

        Assert.Equal("InProgress", game.Status);
        Assert.Equal("P1", game.CurrentTurn);
        Assert.Equal(0, game.MoveCount);
        Assert.Equal(24, game.BoardState.Pieces.Count);
        Assert.Equal(8, game.BoardState.Rows);
        Assert.Equal(10, game.BoardState.Cols);
        Assert.Equal("Classic", game.Ruleset);
        Assert.Equal("Classic", game.Layout);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal(GameStatus.InProgress, row.Status);
        Assert.Equal(0, row.MoveCount);
        Assert.Equal(24, row.State.Pieces.Count);
        Assert.Equal("Classic", row.Ruleset);
        Assert.Equal("Classic", row.Layout);
        Assert.Empty(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task Post_games_with_an_explicit_classic_ruleset_and_layout_echoes_them()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { ruleset = "Classic", layout = "Classic" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("Classic", game.Ruleset);
        Assert.Equal("Classic", game.Layout);
        Assert.Equal(24, game.BoardState.Pieces.Count);
    }

    [SkippableFact]
    public async Task Post_games_with_an_empty_body_defaults_to_classic()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("Classic", game.Ruleset);
        Assert.Equal("Classic", game.Layout);
    }

    [SkippableFact]
    public async Task Post_games_with_an_unknown_ruleset_returns_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { ruleset = "Bogus" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("Bogus", error!.Error);
    }

    [SkippableFact]
    public async Task Post_games_with_an_unknown_layout_returns_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { layout = "Nonsense" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("Nonsense", error!.Error);
    }

    [SkippableFact]
    public async Task Post_games_with_the_imhotep_layout_persists_and_echoes_it()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { layout = "Imhotep" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("Classic", game.Ruleset); // Imhotep rides the Classic ruleset
        Assert.Equal("Imhotep", game.Layout);
        Assert.Equal(24, game.BoardState.Pieces.Count);
        Assert.Contains(game.BoardState.Pieces, p => p is { Row: 7, Col: 4, Kind: "Pharaoh", Owner: "P1" });

        var found = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal("Imhotep", found!.Layout);
        Assert.Equal(24, found.BoardState.Pieces.Count);
    }

    [SkippableFact]
    public async Task Get_games_returns_current_state_and_404_for_unknown()
    {
        var client = NewClient();
        var created = await CreateGameAsync(client);

        var found = await client.GetFromJsonAsync<GameResponse>($"/api/games/{created.Id}");
        Assert.NotNull(found);
        Assert.Equal(created.Id, found!.Id);
        Assert.Equal(created.BoardState.Pieces.Count, found.BoardState.Pieces.Count);

        var unknownId = Guid.NewGuid();
        var miss = await client.GetAsync($"/api/games/{unknownId}");
        Assert.Equal(HttpStatusCode.NotFound, miss.StatusCode);
        var error = await miss.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains(unknownId.ToString(), error!.Error);
    }

    [SkippableFact]
    public async Task Move_appends_one_row_overwrites_state_flips_turn_keeps_one_snapshot()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", QuietOpening);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<SubmitMoveResponse>();
        Assert.Equal(1, body!.MoveNumber);
        Assert.Equal("P2", body.CurrentTurn);
        Assert.Equal("InProgress", body.Status);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal(1, row.MoveCount);
        Assert.Equal(Player.P2, row.CurrentTurn);

        // The board advanced: the piece left (2,3) and now sits at (2,4).
        Assert.DoesNotContain(row.State.Pieces, p => p is { Row: 2, Col: 3 });
        Assert.Contains(row.State.Pieces, p => p is { Row: 2, Col: 4 });

        // Exactly one move row, and the only board snapshot is Games.State — Move carries the
        // laser trace but no board of its own.
        var moves = await Db(scope).Moves.AsNoTracking().Where(m => m.GameId == game.Id).ToListAsync();
        var move = Assert.Single(moves);
        Assert.Equal(1, move.MoveNumber);
        Assert.Equal(Player.P1, move.Player);
    }

    [SkippableFact]
    public async Task Illegal_move_returns_400_and_persists_nothing()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        // (2,3) holds a piece, but (2,7) is nowhere near it — fails the adjacency rule.
        var illegal = new SubmitMoveRequest("move", new CoordDto(2, 3), new CoordDto(2, 7), null);
        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", illegal);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.False(string.IsNullOrWhiteSpace(error!.Error));

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal(0, row.MoveCount);
        Assert.Equal(Player.P1, row.CurrentTurn);
        Assert.Contains(row.State.Pieces, p => p is { Row: 2, Col: 3 });
        Assert.Empty(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task Move_on_a_finished_game_returns_409()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == game.Id);
            row.Status = GameStatus.P2Win;
            await db.SaveChangesAsync();
        }

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", QuietOpening);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Equal("game is already finished", error!.Error);

        await using var scope = Scope();
        Assert.Empty(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task A_winning_move_sets_status_and_leaves_the_turn_on_the_winner()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        // Seed a position where rotating P1's pyramid CCW steers the beam into P2's pharaoh
        // (the fixture from FullTurnTests).
        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == game.Id);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }

        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", rotate);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<SubmitMoveResponse>();
        Assert.Equal("P1Win", body!.Status);
        Assert.Equal("P1", body.CurrentTurn);

        await using var scope = Scope();
        var updated = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal(GameStatus.P1Win, updated.Status);
        Assert.Equal(Player.P1, updated.CurrentTurn);
        Assert.Single(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task Unstack_on_a_classic_game_splits_the_obelisk_and_writes_an_unstack_row()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client); // default = Classic; P1 obelisk at (7,3) is two-high, (6,3) is empty

        var unstack = new SubmitMoveRequest("unstack", new CoordDto(7, 3), new CoordDto(6, 3), null);
        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", unstack);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        var source = Assert.Single(row.State.Pieces, p => p is { Row: 7, Col: 3 });
        var dropped = Assert.Single(row.State.Pieces, p => p is { Row: 6, Col: 3 });
        Assert.Equal("Obelisk", source.Kind);
        Assert.Equal(1, source.Health);
        Assert.Equal("Obelisk", dropped.Kind);
        Assert.Equal("P1", dropped.Owner);
        Assert.Equal(1, dropped.Health);

        var move = Assert.Single(await Db(scope).Moves.AsNoTracking().Where(m => m.GameId == game.Id).ToListAsync());
        Assert.Equal(MoveKind.Unstack, move.Type);
        Assert.NotNull(move.LaserResult); // jsonb round-trips
    }

    [SkippableFact]
    public async Task Unstack_on_a_khet2_game_is_rejected_because_that_ruleset_has_no_stacking()
    {
        var client = NewClient();
        var res = await client.PostAsJsonAsync("/api/games", new { ruleset = "Khet2", layout = "Khet2Classic" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        // (7,3) is a two-high P1 obelisk and (6,3) is empty in Khet2Classic too — the request is
        // well-formed and only the ruleset flag stops it. This is the proof that GameService
        // threads game.Ruleset into the engine.
        var unstack = new SubmitMoveRequest("unstack", new CoordDto(7, 3), new CoordDto(6, 3), null);
        var moveRes = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", unstack);

        Assert.Equal(HttpStatusCode.BadRequest, moveRes.StatusCode);
        var error = await moveRes.Content.ReadFromJsonAsync<MoveError>();
        Assert.Equal("stacking is not enabled for this ruleset", error!.Error);

        await using var scope = Scope();
        Assert.Empty(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task Laser_result_jsonb_round_trips_with_segment_order_preserved()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", QuietOpening);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<SubmitMoveResponse>();
        var fromResponse = body!.LaserSegments.Select(Key).ToList();
        Assert.NotEmpty(fromResponse);

        await using var scope = Scope();
        var move = await Db(scope).Moves.AsNoTracking().SingleAsync(m => m.GameId == game.Id);
        Assert.NotNull(move.LaserResult);
        var fromDb = move.LaserResult.Segments.Select(Key).ToList();

        // Same segments, same order, after a full serialize -> Postgres jsonb -> deserialize trip.
        Assert.Equal(fromResponse, fromDb);
        Assert.Equal("P1", move.LaserResult.FiredBy);

        static (int, int, string, string?) Key(LaserResultSegment s) => (s.Row, s.Col, s.Enter, s.Exit);
    }
}
