using Khet.Api.Data;
using Khet.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of the rematch propose/match flow: <c>POST /api/games/{id}/rematch</c> and its
/// <c>/decline</c> counterpart. Skips (doesn't fail) when no Postgres is reachable, same convention
/// as the rest of <c>Api/</c> — see <see cref="ResignationIntegrationTests"/> for the sibling suite
/// this mirrors.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class RematchIntegrationTests(IntegrationFixture fixture)
{
    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static KhetDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client, string? timeControl = null)
    {
        var res = timeControl is null
            ? await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest())
            : await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest(TimeControl: timeControl));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    /// <summary>Creates a room with two authenticated seats and immediately ends it via resignation
    /// — the simplest way to reach the "finished room game" state rematch requires.</summary>
    private async Task<(HttpClient P1, HttpClient P2, RoomResponse Room)> FinishedRoomAsync(string? timeControl = null)
    {
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1, timeControl);
        var (p2, _) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var resign = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P1"));
        Assert.Equal(HttpStatusCode.OK, resign.StatusCode);

        return (p1, p2, room);
    }

    [SkippableFact]
    public async Task First_request_is_pending_and_creates_no_game()
    {
        var (p1, _, room) = await FinishedRoomAsync();

        var res = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));

        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);

        var game = await p1.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Null(game!.RematchGameId);
    }

    [SkippableFact]
    public async Task Second_request_creates_a_new_room_with_seats_swapped_and_settings_carried_over()
    {
        var (p1, p2, room) = await FinishedRoomAsync(timeControl: "5+0");

        var first = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));
        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);

        var second = await p2.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P2"));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var newRoom = (await second.Content.ReadFromJsonAsync<RoomResponse>())!;
        Assert.NotEqual(room.GameId, newRoom.GameId);
        // P2 is the caller here, and seats swap on a rematch, so P2 lands as the new P1.
        Assert.Equal("P1", newRoom.Seat);

        var oldGame = await p1.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal(newRoom.GameId, oldGame!.RematchGameId);

        await using var scope = Scope();
        var db = Db(scope);
        var oldRow = await db.Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        var newRow = await db.Games.AsNoTracking().SingleAsync(g => g.Id == newRoom.GameId);

        Assert.Equal(oldRow.P2UserId, newRow.P1UserId);
        Assert.Equal(oldRow.P1UserId, newRow.P2UserId);
        Assert.Equal(oldRow.Rated, newRow.Rated);
        Assert.Equal(oldRow.Ruleset, newRow.Ruleset);
        Assert.Equal(oldRow.Layout, newRow.Layout);
        Assert.Equal("5+0", newRow.TimeControl);
        Assert.NotNull(newRow.TurnDeadlineUtc);
        Assert.NotNull(newRow.P1RemainingMs);
        Assert.NotNull(newRow.P2RemainingMs);
    }

    [SkippableFact]
    public async Task Concurrent_double_request_creates_exactly_one_new_game()
    {
        var (p1, p2, room) = await FinishedRoomAsync();
        var p1Id = (await p1.GetFromJsonAsync<UserProfile>("/api/auth/me"))!.Id;
        var p2Id = (await p2.GetFromJsonAsync<UserProfile>("/api/auth/me"))!.Id;

        var requestP1 = p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));
        var requestP2 = p2.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P2"));
        var results = await Task.WhenAll(requestP1, requestP2);

        var matched = new List<RoomResponse>();
        foreach (var res in results)
        {
            if (res.StatusCode == HttpStatusCode.OK)
                matched.Add((await res.Content.ReadFromJsonAsync<RoomResponse>())!);
            else
                Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        }

        // Whichever request landed second (possibly both, if they serialized past each other) sees
        // the match — but both a "pending, then a decline never arrives" outcome and "two different
        // rooms" would be a bug: at least one 200 came back, and every 200 names the same room.
        Assert.NotEmpty(matched);
        Assert.Single(matched.Select(r => r.GameId).Distinct());

        // These are fresh per-test accounts, so "every game either seat ever touched" is exactly
        // the finished room plus its one rematch room — never two independently-created ones.
        await using var scope = Scope();
        var gamesForThesePlayers = await Db(scope).Games.AsNoTracking()
            .Where(g => g.P1UserId == p1Id || g.P2UserId == p1Id || g.P1UserId == p2Id || g.P2UserId == p2Id)
            .CountAsync();
        Assert.Equal(2, gamesForThesePlayers);
    }

    [SkippableFact]
    public async Task Re_requesting_after_a_match_is_idempotent()
    {
        var (p1, p2, room) = await FinishedRoomAsync();

        await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));
        var matched = await p2.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P2"));
        var firstRoom = (await matched.Content.ReadFromJsonAsync<RoomResponse>())!;

        var again = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var secondRoom = (await again.Content.ReadFromJsonAsync<RoomResponse>())!;

        Assert.Equal(firstRoom.GameId, secondRoom.GameId);
        Assert.Equal("P2", secondRoom.Seat); // P1 flips to P2 in the new room

        await using var scope = Scope();
        var count = await Db(scope).Games.CountAsync(g => g.Id == firstRoom.GameId);
        Assert.Equal(1, count);
    }

    [SkippableFact]
    public async Task Decline_clears_both_requests_so_a_later_request_starts_fresh()
    {
        var (p1, p2, room) = await FinishedRoomAsync();

        await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));

        var decline = await p2.PostAsJsonAsync($"/api/games/{room.GameId}/rematch/decline", new RematchRequest("P2"));
        Assert.Equal(HttpStatusCode.NoContent, decline.StatusCode);

        await using (var scope = Scope())
        {
            var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
            Assert.Null(row.P1RematchRequestedAtUtc);
            Assert.Null(row.P2RematchRequestedAtUtc);
        }

        // A fresh single request afterward is pending again, not an instant match against the
        // cleared P1 request.
        var freshP2 = await p2.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P2"));
        Assert.Equal(HttpStatusCode.Accepted, freshP2.StatusCode);
    }

    [SkippableFact]
    public async Task A_non_room_game_is_rejected_with_a_400()
    {
        var (client, _) = await NewAuthedClientAsync();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;
        await client.PostAsJsonAsync($"/api/games/{game.Id}/resign", new ResignRequest("P1"));

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/rematch", new RematchRequest("P1"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("not a room game", error!.Error);
    }

    [SkippableFact]
    public async Task A_still_in_progress_game_is_rejected_with_a_409()
    {
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, _) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("P1"));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("still in progress", error!.Error);
    }

    [SkippableFact]
    public async Task An_unknown_seat_is_rejected_with_a_400()
    {
        var (p1, _, room) = await FinishedRoomAsync();

        var res = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/rematch", new RematchRequest("Spectator"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task An_unknown_game_is_404()
    {
        var (client, _) = await NewAuthedClientAsync();

        var res = await client.PostAsJsonAsync($"/api/games/{Guid.NewGuid()}/rematch", new RematchRequest("P1"));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    private static string UniqueEmail() => $"rematch-{Guid.NewGuid():N}@example.com";

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        var client = fixture.Factory.CreateClient();
        var auth = await fixture.RegisterAsync(UniqueEmail(), "Player " + Guid.NewGuid().ToString("N")[..6]);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }
}
