using Khet.Api.Data;
using Khet.Contracts;
using Khet.Engine.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the disconnect/abandonment feature's REST half:
/// <c>POST /api/games/{id}/claim-abandonment</c> and the additive <c>P1DisconnectedAtUtc</c>/
/// <c>P2DisconnectedAtUtc</c> columns. Seeds a disconnect timestamp directly on the row (the hub
/// side that actually stamps it is covered by <see cref="GameHubIntegrationTests"/>) and drives
/// the 45s grace window through the fixture's injectable <see cref="Microsoft.Extensions.Time.Testing.FakeTimeProvider"/>,
/// same convention as <see cref="TimeoutEnforcementIntegrationTests"/>. Skips (doesn't fail) when
/// no Postgres is reachable.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class AbandonmentIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static KhetDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    private static async Task<RoomResponse> CreateTimedRoomAsync(HttpClient client, string timeControl)
    {
        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    /// <summary>Simulates what GameHub.OnDisconnectedAsync would have stamped, without going through the hub.</summary>
    private async Task SeedDisconnectAsync(Guid gameId, string seat, DateTime disconnectedAtUtc)
    {
        await using var scope = Scope();
        var db = Db(scope);
        var row = await db.Games.SingleAsync(g => g.Id == gameId);
        if (seat == "P1")
            row.P1DisconnectedAtUtc = disconnectedAtUtc;
        else
            row.P2DisconnectedAtUtc = disconnectedAtUtc;
        await db.SaveChangesAsync();
    }

    private DateTime Now() => fixture.Factory.TimeProvider.GetUtcNow().UtcDateTime;

    [SkippableFact]
    public async Task Claim_before_the_45s_grace_window_has_elapsed_is_a_409()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        await SeedDisconnectAsync(game.Id, "P2", Now());
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(30));

        var res = await client.PostAsJsonAsync(
            $"/api/games/{game.Id}/claim-abandonment", new ClaimAbandonmentRequest("P1"));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("not been disconnected long enough", error!.Error);

        var stillInProgress = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal("InProgress", stillInProgress!.Status);
    }

    [SkippableFact]
    public async Task Claim_after_the_45s_grace_window_ends_the_game_with_the_claiming_seat_winning()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        await SeedDisconnectAsync(game.Id, "P2", Now());
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(46));

        var res = await client.PostAsJsonAsync(
            $"/api/games/{game.Id}/claim-abandonment", new ClaimAbandonmentRequest("P1"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ClaimAbandonmentResponse>())!;
        Assert.Equal(game.Id, body.GameId);
        Assert.Equal("P1Win", body.Status); // P1 claimed; P2 was the disconnected seat
        Assert.Equal("Abandonment", body.EndReason);

        var reloaded = await client.GetFromJsonAsync<GameResponse>($"/api/games/{game.Id}");
        Assert.Equal("P1Win", reloaded!.Status);
        Assert.Equal("Abandonment", reloaded.EndReason);

        var summary = (await client.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == game.Id);
        Assert.Equal("Abandonment", summary.EndReason);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == game.Id);
        Assert.NotNull(row.FinishedAtUtc);
        Assert.Equal("Abandonment", row.EndReason);
        Assert.Equal(GameStatus.P1Win, row.Status);
    }

    [SkippableFact]
    public async Task Claiming_when_the_opponent_has_no_tracked_disconnect_is_a_409()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        var res = await client.PostAsJsonAsync(
            $"/api/games/{game.Id}/claim-abandonment", new ClaimAbandonmentRequest("P1"));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("opponent is not disconnected", error!.Error);
    }

    [SkippableFact]
    public async Task Claim_abandonment_for_an_unknown_game_is_404()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync(
            $"/api/games/{Guid.NewGuid()}/claim-abandonment", new ClaimAbandonmentRequest("P1"));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task Claim_abandonment_on_an_already_finished_game_is_a_409()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        await using (var seed = Scope())
        {
            var db = Db(seed);
            var row = await db.Games.SingleAsync(g => g.Id == game.Id);
            row.Status = GameStatus.P1Win;
            row.EndReason = "Pharaoh";
            row.FinishedAtUtc = Now();
            row.P2DisconnectedAtUtc = Now(); // even a tracked disconnect can't revive a finished game
            await db.SaveChangesAsync();
        }

        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(46));

        var res = await client.PostAsJsonAsync(
            $"/api/games/{game.Id}/claim-abandonment", new ClaimAbandonmentRequest("P1"));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("already finished", error!.Error);
    }

    [SkippableFact]
    public async Task Abandonment_resolves_the_same_way_for_an_untimed_game()
    {
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        await AssertAbandonmentSucceedsAsync(client, game.Id);
    }

    [SkippableFact]
    public async Task Abandonment_resolves_the_same_way_for_a_daily_game()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "3/move");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await AssertAbandonmentSucceedsAsync(client, room.GameId);
    }

    [SkippableFact]
    public async Task Abandonment_resolves_the_same_way_for_a_live_clock_game()
    {
        var client = NewClient();
        var room = await CreateTimedRoomAsync(client, "10+0");
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await AssertAbandonmentSucceedsAsync(client, room.GameId);
    }

    /// <summary>
    /// Shared by the three time-control variants above: P2 is seeded as disconnected, the 45s
    /// window elapses, and P1's claim must succeed identically regardless of whether/how the game
    /// is clocked — abandonment applies to every game (see plan's "Owner decisions already made").
    /// </summary>
    private async Task AssertAbandonmentSucceedsAsync(HttpClient client, Guid gameId)
    {
        await SeedDisconnectAsync(gameId, "P2", Now());
        fixture.Factory.TimeProvider.Advance(TimeSpan.FromSeconds(46));

        var res = await client.PostAsJsonAsync(
            $"/api/games/{gameId}/claim-abandonment", new ClaimAbandonmentRequest("P1"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ClaimAbandonmentResponse>())!;
        Assert.Equal("P1Win", body.Status);
        Assert.Equal("Abandonment", body.EndReason);
    }
}
