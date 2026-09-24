using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Api.Mapping;
using Heliograph.Contracts;
using Heliograph.Engine;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Heliograph.Api.Tests.Api;

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
    // A known-legal, uneventful P1 opening on the default (Dawn) board (see FullTurnTests): the
    // mirror at (7,2) steps forward to (6,1); P1's beam still runs straight up column 9 and off.
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(7, 2), new CoordDto(6, 1), null);

    // Every game/room endpoint now requires auth (guest play is gone), so the "just give me a
    // working client" helper registers a fresh throwaway account under the hood — the tests in
    // this file are about move/persistence mechanics, not identity, and don't care who's calling.
    // Genuinely-anonymous behavior (401 checks) uses NewAnonymousClient() instead.
    private HttpClient NewClient()
    {
        var (client, _) = NewAuthedClientAsync().GetAwaiter().GetResult();
        return client;
    }

    private HttpClient NewAnonymousClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static HeliographDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<HeliographDbContext>();

    private async Task<GameResponse> CreateGameAsync(HttpClient client)
    {
        var res = await client.PostAsync("/api/games", content: null);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = await res.Content.ReadFromJsonAsync<GameResponse>();
        Assert.NotNull(game);
        return game!;
    }

    // --- helpers for the P1Profile/P2Profile tests below, mirroring GameEloIntegrationTests' pattern ---

    private static string UniqueEmail() => $"profile-{Guid.NewGuid():N}@example.com";

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync(string? displayName = null)
    {
        var client = NewAnonymousClient();
        var auth = await fixture.RegisterAsync(UniqueEmail(), displayName ?? "Player " + Guid.NewGuid().ToString("N")[..6]);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client, string? timeControl = null)
    {
        var res = timeControl is null
            ? await client.PostAsync("/api/rooms", content: null)
            : await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task Creating_a_game_or_room_without_auth_returns_401()
    {
        var anonymous = NewAnonymousClient();

        var gameRes = await anonymous.PostAsync("/api/games", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, gameRes.StatusCode);

        var roomRes = await anonymous.PostAsync("/api/rooms", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, roomRes.StatusCode);
    }

    [SkippableFact]
    public async Task Post_games_writes_one_row_with_the_default_layout()
    {
        var client = NewClient();

        var game = await CreateGameAsync(client);

        Assert.Equal("InProgress", game.Status);
        Assert.Equal("P1", game.CurrentTurn);
        Assert.Equal(0, game.MoveCount);
        Assert.Equal(24, game.BoardState.Pieces.Count);
        Assert.Equal(8, game.BoardState.Rows);
        Assert.Equal(10, game.BoardState.Cols);
        Assert.Equal("FixedSun", game.Ruleset);
        Assert.Equal("Dawn", game.Layout);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal(GameStatus.InProgress, row.Status);
        Assert.Equal(0, row.MoveCount);
        Assert.Equal(24, row.State.Pieces.Count);
        Assert.Equal("FixedSun", row.Ruleset);
        Assert.Equal("Dawn", row.Layout);
        Assert.Empty(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task Post_games_with_an_explicit_ruleset_and_layout_echoes_them()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { ruleset = "FixedSun", layout = "Zenith" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("FixedSun", game.Ruleset);
        Assert.Equal("Zenith", game.Layout);
        Assert.Equal(24, game.BoardState.Pieces.Count);
        Assert.Contains(game.BoardState.Pieces, p => p is { Row: 7, Col: 4, Kind: "Keep", Owner: "P1" });
    }

    [SkippableFact]
    public async Task Post_games_with_an_empty_body_defaults_the_ruleset_and_the_layout()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("FixedSun", game.Ruleset);
        Assert.Equal("Dawn", game.Layout);
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
    public async Task Post_games_with_an_explicit_first_player_starts_that_player_to_move()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { firstPlayer = "P2" });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;
        Assert.Equal("P2", game.CurrentTurn);
    }

    [SkippableFact]
    public async Task Post_games_with_an_unknown_first_player_returns_400()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { firstPlayer = "P3" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("P3", error!.Error);
    }

    [SkippableFact]
    public async Task Post_games_with_the_dusk_layout_persists_and_echoes_its_canonical_name()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { layout = "dusk" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("FixedSun", game.Ruleset);
        Assert.Equal("Dusk", game.Layout);
        Assert.Equal(24, game.BoardState.Pieces.Count);
        Assert.Contains(game.BoardState.Pieces, p => p is { Row: 6, Col: 4, Kind: "Keep", Owner: "P1" });

        var found = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal("Dusk", found!.Layout);
        Assert.Equal(24, found.BoardState.Pieces.Count);
    }

    [SkippableFact]
    public async Task Post_games_under_the_rotating_ruleset_builds_the_derived_board_under_the_same_layout_name()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync("/api/games", new { ruleset = "TurningSun", layout = "Zenith" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        Assert.Equal("TurningSun", game.Ruleset);
        Assert.Equal("Zenith", game.Layout);
        Assert.Equal(26, game.BoardState.Pieces.Count); // + a Heliostat per side
        Assert.Contains(game.BoardState.Pieces, p => p is { Row: 7, Col: 9, Kind: "Heliostat", Owner: "P1" });
        Assert.Contains(game.BoardState.Pieces, p => p is { Row: 7, Col: 3, Kind: "Sentinel", Owner: "P1" });
        Assert.DoesNotContain(game.BoardState.Pieces, p => p.Kind == "Bastion");
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

        // The board advanced: the piece left (7,2) and now sits at (6,1).
        Assert.DoesNotContain(row.State.Pieces, p => p is { Row: 7, Col: 2 });
        Assert.Contains(row.State.Pieces, p => p is { Row: 6, Col: 1 });

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

        // (7,2) holds a piece, but (2,2) is nowhere near it — fails the adjacency rule.
        var illegal = new SubmitMoveRequest("move", new CoordDto(7, 2), new CoordDto(2, 2), null);
        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", illegal);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.False(string.IsNullOrWhiteSpace(error!.Error));

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal(0, row.MoveCount);
        Assert.Equal(Player.P1, row.CurrentTurn);
        Assert.Contains(row.State.Pieces, p => p is { Row: 7, Col: 2 });
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

        // Seed a position where rotating P1's mirror CCW steers the beam into P2's keep
        // (the fixture from FullTurnTests).
        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == game.Id);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Mirror(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Keep(Player.P2)),
                (new Coord(7, 0), TestBoard.Keep(Player.P1))));
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
        Assert.NotNull(updated.FinishedAtUtc);
        Assert.True(updated.FinishedAtUtc >= updated.CreatedAtUtc);
        Assert.Single(await Db(scope).Moves.Where(m => m.GameId == game.Id).ToListAsync());
    }

    [SkippableFact]
    public async Task Unstack_on_a_classic_game_splits_the_bastion_and_writes_an_unstack_row()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client); // default = FixedSun ruleset on Dawn; P1 bastion at (7,3) is two-high, (6,3) is empty

        var unstack = new SubmitMoveRequest("unstack", new CoordDto(7, 3), new CoordDto(6, 3), null);
        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", unstack);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        var source = Assert.Single(row.State.Pieces, p => p is { Row: 7, Col: 3 });
        var dropped = Assert.Single(row.State.Pieces, p => p is { Row: 6, Col: 3 });
        Assert.Equal("Bastion", source.Kind);
        Assert.Equal(1, source.Health);
        Assert.Equal("Bastion", dropped.Kind);
        Assert.Equal("P1", dropped.Owner);
        Assert.Equal(1, dropped.Health);

        var move = Assert.Single(await Db(scope).Moves.AsNoTracking().Where(m => m.GameId == game.Id).ToListAsync());
        Assert.Equal(MoveKind.Unstack, move.Type);
        Assert.NotNull(move.LaserResult); // jsonb round-trips
    }

    [SkippableFact]
    public async Task Unstack_on_a_turningsun_game_is_rejected_because_that_ruleset_has_no_stacking()
    {
        var client = NewClient();
        var res = await client.PostAsJsonAsync("/api/games", new { ruleset = "TurningSun", layout = "Dawn" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;

        // A rotating-emitter board has no bastion (each becomes an Sentinel) — seed a real
        // two-high P1 bastion on an empty, legal square so the request is genuinely well-formed
        // and only the ruleset flag stops it. This is the proof that GameService threads
        // game.Ruleset into the engine, not an incidental "no bastion to unstack" 400.
        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == game.Id);
            var board = BoardMapper.ToBoard(row.State)
                .With(new Coord(5, 2), new PieceOnBoard(Piece.Bastion, Player.P1, null, 2));
            row.State = BoardMapper.ToState(board);
            await db.SaveChangesAsync();
        }

        var unstack = new SubmitMoveRequest("unstack", new CoordDto(5, 2), new CoordDto(5, 3), null);
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

    [SkippableFact]
    public async Task Get_moves_returns_empty_list_for_a_fresh_game_and_404_for_unknown()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        var history = await client.GetFromJsonAsync<MoveHistoryResponse>($"/api/games/{game.Id}/moves");
        Assert.NotNull(history);
        Assert.Empty(history!.Moves);
        Assert.Equal(24, history.StartingBoardState.Pieces.Count);

        var unknownId = Guid.NewGuid();
        var miss = await client.GetAsync($"/api/games/{unknownId}/moves");
        Assert.Equal(HttpStatusCode.NotFound, miss.StatusCode);
        var error = await miss.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains(unknownId.ToString(), error!.Error);
    }

    [SkippableFact]
    public async Task Get_moves_returns_history_in_order_with_move_and_rotate_types()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        var moveRes = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", QuietOpening);
        Assert.Equal(HttpStatusCode.OK, moveRes.StatusCode);

        // P2's turn: rotate the mirror at (0,7) CW — quiet, doesn't touch either opening beam.
        var rotate = new SubmitMoveRequest("rotate", new CoordDto(0, 7), null, "CW");
        var rotateRes = await client.PostAsJsonAsync($"/api/games/{game.Id}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, rotateRes.StatusCode);

        var history = await client.GetFromJsonAsync<MoveHistoryResponse>($"/api/games/{game.Id}/moves");
        Assert.NotNull(history);
        Assert.Equal(2, history!.Moves.Count);
        Assert.Equal(24, history.StartingBoardState.Pieces.Count);
        // The starting board is the untouched Dawn layout — the piece that's about to move
        // to (6,1) is still at its opening square (7,2).
        Assert.Contains(history.StartingBoardState.Pieces, p => p is { Row: 7, Col: 2 });

        var first = history.Moves[0];
        Assert.Equal(1, first.MoveNumber);
        Assert.Equal("P1", first.Player);
        Assert.Equal("Move", first.Type);
        Assert.Equal(new CoordDto(7, 2), first.From);
        Assert.Equal(new CoordDto(6, 1), first.To);
        Assert.Null(first.Rotation);
        Assert.NotNull(first.LaserResult);
        // Replayed board: the moved piece is at its destination, not its origin.
        Assert.DoesNotContain(first.BoardState.Pieces, p => p is { Row: 7, Col: 2 });
        Assert.Contains(first.BoardState.Pieces, p => p is { Row: 6, Col: 1 });

        var second = history.Moves[1];
        Assert.Equal(2, second.MoveNumber);
        Assert.Equal("P2", second.Player);
        Assert.Equal("Rotate", second.Type);
        Assert.Equal(new CoordDto(0, 7), second.From);
        Assert.Null(second.To);
        Assert.Equal("CW", second.Rotation);
        Assert.NotNull(second.LaserResult);

        // The last history entry's replayed board must match the game's real, persisted current
        // state exactly (both come from BoardMapper.ToState, so both list pieces Row-then-Col) —
        // proof the engine replay reproduces reality, not just a plausible board.
        var current = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal(current!.BoardState.Pieces, second.BoardState.Pieces);

        // Cross-check against the DB rows directly, matching the file's existing convention.
        await using var scope = Scope();
        var rows = await Db(scope).Moves.AsNoTracking()
            .Where(m => m.GameId == game.Id)
            .OrderBy(m => m.MoveNumber)
            .ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.Equal(MoveKind.Move, rows[0].Type);
        Assert.Equal(MoveKind.Rotate, rows[1].Type);
    }

    [SkippableFact]
    public async Task Get_moves_for_a_game_on_a_retired_layout_is_410_not_a_crash_and_listing_still_works()
    {
        var client = NewClient();
        var game = await CreateGameAsync(client);

        // A game stored before IP-02 carries a layout name the registry no longer knows.
        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == game.Id);
            row.Layout = "RetiredLayout";
            await db.SaveChangesAsync();
        }

        var res = await client.GetAsync($"/api/games/{game.Id}/moves");
        Assert.Equal(HttpStatusCode.Gone, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("RetiredLayout", error!.Error);

        // Reading and listing never resolve the layout, so they keep working.
        var found = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal("RetiredLayout", found!.Layout);
        var list = await client.GetFromJsonAsync<List<GameSummary>>("/api/games");
        Assert.Contains(list!, g => g.Id == game.Id && g.Layout == "RetiredLayout");
    }

    [SkippableFact]
    public async Task Get_games_lists_summaries_newest_first_with_finishedAtUtc_only_once_finished()
    {
        var client = NewClient();
        var older = await CreateGameAsync(client);
        // GameService.CreatedAtUtc now comes from the fixture's shared FakeTimeProvider (see
        // IntegrationFixture), which doesn't advance on its own the way DateTime.UtcNow used to
        // between two calls a few ms apart — without this, `older`/`newer` land on the exact same
        // timestamp and the newest-first ordering assertion below is undefined.
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(1));
        var newer = await CreateGameAsync(client);

        // Finish `newer` via the same seeded win position used elsewhere in this file.
        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == newer.Id);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Mirror(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Keep(Player.P2)),
                (new Coord(7, 0), TestBoard.Keep(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }
        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var winRes = await client.PostAsJsonAsync($"/api/games/{newer.Id}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, winRes.StatusCode);

        var list = await client.GetFromJsonAsync<List<GameSummary>>("/api/games");
        Assert.NotNull(list);

        var newerSummary = list!.Single(g => g.Id == newer.Id);
        var olderSummary = list.Single(g => g.Id == older.Id);

        Assert.Equal("P1Win", newerSummary.Status);
        Assert.NotNull(newerSummary.FinishedAtUtc);
        Assert.Equal(1, newerSummary.MoveCount);

        Assert.Equal("InProgress", olderSummary.Status);
        Assert.Null(olderSummary.FinishedAtUtc);
        Assert.Equal(0, olderSummary.MoveCount);

        // Newest-first ordering.
        Assert.True(list.IndexOf(newerSummary) < list.IndexOf(olderSummary));
    }

    [SkippableFact]
    public async Task An_unfilled_P2_seat_has_a_null_profile()
    {
        // Rooms are auth-only now (guest play is gone), so P1 is always claimed at creation —
        // the only "unclaimed" seat left to observe is P2 before anyone's joined it.
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);

        var game = await p1.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");

        Assert.NotNull(game!.P1Profile);
        Assert.Null(game.P2Profile);
    }

    /// <summary>
    /// Regression coverage for the active-game-banner recovery path: a client that re-discovers an
    /// in-progress game outside the room-join flow (no join-code URL params to read a seat back out
    /// of) needs the server to say which seat, if any, it holds — GET now reports that as
    /// <see cref="GameResponse.MySeat"/>, computed from the caller's own id, never trusted from a
    /// client-supplied value.
    /// </summary>
    [SkippableFact]
    public async Task MySeat_reports_the_callers_own_seat_and_null_for_a_spectator()
    {
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, _) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        var (stranger, _) = await NewAuthedClientAsync();

        var asP1 = await p1.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        var asP2 = await p2.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        var asStranger = await stranger.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");

        Assert.Equal("P1", asP1!.MySeat);
        Assert.Equal("P2", asP2!.MySeat);
        Assert.Null(asStranger!.MySeat);
    }

    [SkippableFact]
    public async Task A_claimed_seat_populates_its_profile_with_display_name_avatar_and_the_matching_category_rating()
    {
        // "5+0" is a Blitz preset (see TimeControls) — the profile's rating must come from the
        // Blitz bucket specifically, not just whatever the default 1200 happens to be everywhere.
        var (p1, p1Auth) = await NewAuthedClientAsync("Ada");
        var room = await CreateRoomAsync(p1, "5+0");
        var (p2, p2Auth) = await NewAuthedClientAsync("Bea");
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        // Pick an avatar and seed a Blitz rating that diverges from both the 1200 default and
        // p1's own Rapid bucket — a test that only checks "not 1200" could pass on the wrong bucket.
        var avatarRes = await p1.PatchAsJsonAsync("/api/auth/me", new PatchMeRequest(AvatarId: "gear"));
        Assert.Equal(HttpStatusCode.OK, avatarRes.StatusCode);
        await using (var seed = Scope())
        {
            var db = Db(seed);
            var user = await db.Users.SingleAsync(u => u.Id == p1Auth.User.Id);
            user.BlitzRating = 1350;
            user.RapidRating = 1400;
            await db.SaveChangesAsync();
        }

        var game = await p1.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");

        Assert.NotNull(game!.P1Profile);
        Assert.Equal("Ada", game.P1Profile!.DisplayName);
        Assert.Equal("gear", game.P1Profile.AvatarId);
        Assert.Equal(1350, game.P1Profile.Rating); // Blitz bucket, not the 1400 Rapid bucket or the 1200 default

        Assert.NotNull(game.P2Profile);
        Assert.Equal("Bea", game.P2Profile!.DisplayName);
        Assert.Null(game.P2Profile.AvatarId); // never picked one — falls back to initial-letter on the frontend
        Assert.Equal(1200, game.P2Profile.Rating); // untouched default Blitz bucket

        _ = p2Auth;
    }

    [SkippableFact]
    public async Task An_untimed_rooms_player_profiles_report_the_untimed_bucket()
    {
        // No TimeControl means the Untimed bucket applies (see GameEndService.ApplyEloAsync's
        // doc comment) — a fresh account's default there is 1200, same as every other bucket.
        var (p1, _) = await NewAuthedClientAsync("Cleo");
        var room = await CreateRoomAsync(p1); // untimed
        var (p2, _) = await NewAuthedClientAsync("Dio");
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var game = await p1.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");

        Assert.NotNull(game!.P1Profile);
        Assert.Equal(1200, game.P1Profile!.Rating);
        Assert.NotNull(game.P2Profile);
        Assert.Equal(1200, game.P2Profile!.Rating);
    }

}
