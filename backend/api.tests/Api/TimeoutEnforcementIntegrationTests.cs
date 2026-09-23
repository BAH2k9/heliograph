using Heliograph.Api.Data;
using Heliograph.Api.Domain;
using Heliograph.Api.Mapping;
using Heliograph.Contracts;
using Heliograph.Engine;
using Heliograph.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace Heliograph.Api.Tests.Api;

/// <summary>
/// DB-backed tests of BE-3: timeout enforcement in <c>SubmitMoveAsync</c>,
/// <c>POST /api/games/{id}/claim-timeout</c>, <c>EndReason</c>, and Elo-on-timeout. Skips
/// (doesn't fail) when no Postgres is reachable, same convention as the rest of <c>Api/</c>.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class TimeoutEnforcementIntegrationTests(IntegrationFixture fixture)
{
    private static readonly SubmitMoveRequest QuietOpening =
        new("move", new CoordDto(4, 1), new CoordDto(3, 1), null);

    // Every game/room endpoint now requires auth (guest play is gone) — these tests are about
    // clock/timeout mechanics, not identity, so the "just give me a working client" helper
    // registers a fresh throwaway account under the hood.
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

    private static async Task<RoomResponse> CreateTimedRoomAsync(HttpClient client, string timeControl)
    {
        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task Claim_timeout_on_an_untimed_game_is_a_409()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        var res = await client.PostAsync($"/api/games/{game.Id}/claim-timeout", content: null);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("no clock", error!.Error);
    }

    [SkippableFact]
    public async Task Claim_timeout_before_the_deadline_has_passed_is_a_409_no_op()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "10+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsync($"/api/games/{room.GameId}/claim-timeout", content: null);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal("InProgress", game!.Status);
    }

    [SkippableFact]
    public async Task Claim_timeout_for_an_unknown_game_is_404()
    {
        var client = NewClient();

        var res = await client.PostAsync($"/api/games/{Guid.NewGuid()}/claim-timeout", content: null);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task Claim_timeout_after_the_deadline_ends_the_game_with_the_opponent_winning()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "1+0"); // 60s bank, P1 to move first
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        var res = await client.PostAsync($"/api/games/{room.GameId}/claim-timeout", content: null);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ClaimTimeoutResponse>())!;
        Assert.Equal(room.GameId, body.GameId);
        Assert.Equal("P2Win", body.Status); // P1 was to move and ran out, so P2 wins
        Assert.Equal("Timeout", body.EndReason);

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal("P2Win", game!.Status);
        Assert.False(game.TimedOut); // finished, not InProgress — TimedOut is gated on InProgress
        // GET must surface why the game ended, not just that it did — a plain reload/resync/late
        // reconnect has no other way to tell this apart from an ordinary Pharaoh win (owner
        // decision: EndReason belongs on GameResponse, not just the archive's GameSummary).
        Assert.Equal("Timeout", game.EndReason);

        var summary = (await client.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == room.GameId);
        Assert.Equal("Timeout", summary.EndReason);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.NotNull(row.FinishedAtUtc);
        Assert.Equal("Timeout", row.EndReason);
    }

    [SkippableFact]
    public async Task A_second_claim_timeout_on_an_already_finished_game_is_a_409()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "1+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        var first = await client.PostAsync($"/api/games/{room.GameId}/claim-timeout", content: null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsync($"/api/games/{room.GameId}/claim-timeout", content: null);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var error = await second.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("already finished", error!.Error);
    }

    [SkippableFact]
    public async Task Submitting_a_move_after_the_movers_clock_expired_ends_the_game_instead_of_applying_it()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "1+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        var res = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/moves", QuietOpening with { Seat = "P1" });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<MoveTimedOutError>())!;
        // Superset of MoveError's { "error": ... } shape — the existing 4xx handler still works.
        Assert.False(string.IsNullOrWhiteSpace(body.Error));
        Assert.Equal("P2Win", body.Status);
        Assert.Equal("Timeout", body.EndReason);

        // The submitted move was never applied: MoveCount stays 0 and the piece never left (4,1).
        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.Equal(0, row.MoveCount);
        Assert.Equal("P2Win", row.Status.ToString());
        Assert.Equal("Timeout", row.EndReason);
    }

    [SkippableFact]
    public async Task An_expired_mover_cannot_sneak_a_move_in_even_if_it_would_have_won()
    {
        // Same seeded "P1 wins by rotation" position used across this suite (see
        // GameEloIntegrationTests) — but P1's own clock has already expired, so the pre-validation
        // timeout check must win the race: the game ends by timeout, not by the Pharaoh hit.
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "1+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW") { Seat = "P1" };
        var res = await client.PostAsJsonAsync($"/api/games/{room.GameId}/moves", rotate);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<MoveTimedOutError>())!;
        // P1 timed out, so P2 wins by timeout — even though P1's queued move would have won by
        // Pharaoh hit had it arrived in time.
        Assert.Equal("P2Win", body.Status);
        Assert.Equal("Timeout", body.EndReason);
    }

    [SkippableFact]
    public async Task A_rated_games_timeout_updates_elo_same_as_an_ordinary_win()
    {
        // "1+0" is a Bullet preset (see TimeControls) — the win should move the Bullet bucket.
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateTimedRoomAsync(p1, "1+0");
        var (p2, p2Auth) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(61));

        var claim = await p2.PostAsync($"/api/games/{room.GameId}/claim-timeout", content: null);
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);

        var winner = await p2.GetFromJsonAsync<UserProfile>("/api/auth/me");
        var loser = await p1.GetFromJsonAsync<UserProfile>("/api/auth/me");

        var winnerBullet = winner!.Ratings.Single(b => b.Category == "Bullet");
        var loserBullet = loser!.Ratings.Single(b => b.Category == "Bullet");

        Assert.Equal(p2Auth.User.Id, winner.Id);
        Assert.True(winnerBullet.Rating > 1200);
        Assert.Equal(1, winnerBullet.GamesPlayed);

        Assert.Equal(p1Auth.User.Id, loser.Id);
        Assert.True(loserBullet.Rating < 1200);
        Assert.Equal(1, loserBullet.GamesPlayed);
    }

    [SkippableFact]
    public async Task An_accepted_move_subtracts_elapsed_time_and_adds_the_increment()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "3+2"); // 180s bank, 2s increment
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(10));

        var res = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/moves", QuietOpening with { Seat = "P1" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var body = (await res.Content.ReadFromJsonAsync<SubmitMoveResponse>())!;
        // 180s - 10s elapsed + 2s increment = 172s for P1; P2's own bank is untouched.
        Assert.Equal(172_000, body.P1RemainingMs);
        Assert.Equal(180_000, body.P2RemainingMs);
        // The next turn (P2's) starts now and must be beaten before P2's own 180s bank elapses.
        Assert.Equal(TimeSpan.FromSeconds(180), body.TurnDeadlineUtc - body.TurnStartedAtUtc);
    }

    [SkippableFact]
    public async Task A_daily_games_deadline_resets_to_days_per_move_after_each_accepted_move()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "3/move");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/moves", QuietOpening with { Seat = "P1" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var body = (await res.Content.ReadFromJsonAsync<SubmitMoveResponse>())!;
        Assert.Null(body.P1RemainingMs);
        Assert.Null(body.P2RemainingMs);
        Assert.Equal(TimeSpan.FromDays(3), body.TurnDeadlineUtc - body.TurnStartedAtUtc);
    }

    [SkippableFact]
    public async Task A_normal_pharaoh_win_records_EndReason_pharaoh_not_timeout()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;
        Assert.Null(game.EndReason); // still InProgress — no reason to end yet

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

        // GET (not just the DB row) must show "Pharaoh", not "Timeout" and not null — same
        // GameResponse.EndReason field a timeout loss uses, distinguishing the two on every read.
        var finished = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal("P1Win", finished!.Status);
        Assert.Equal("Pharaoh", finished.EndReason);

        var summary = (await client.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == game.Id);
        Assert.Equal("Pharaoh", summary.EndReason);

        await using var scope = Scope();
        var row2 = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.Equal("P1Win", row2.Status.ToString());
        Assert.Equal("Pharaoh", row2.EndReason);
    }

    private static string UniqueEmail() => $"timeout-{Guid.NewGuid():N}@example.com";

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync()
    {
        var client = NewAnonymousClient();
        var auth = await fixture.RegisterAsync(UniqueEmail(), "Player " + Guid.NewGuid().ToString("N")[..6]);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }
}
