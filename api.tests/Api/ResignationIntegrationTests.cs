using System.Net;
using System.Net.Http.Json;
using Khet.Api.Contracts;
using Khet.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of resignation: <c>POST /api/games/{id}/resign</c>, <c>EndReason ==
/// "Resignation"</c>, and Elo-on-resignation. Skips (doesn't fail) when no Postgres is reachable,
/// same convention as the rest of <c>Api/</c> — see <see cref="TimeoutEnforcementIntegrationTests"/>
/// for the sibling suite this mirrors.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class ResignationIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private AsyncServiceScope Scope() => fixture.Factory.Services.CreateAsyncScope();

    private static KhetDbContext Db(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client)
    {
        var res = await client.PostAsJsonAsync("/api/rooms", new CreateRoomRequest());
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task Resigning_ends_the_game_with_the_other_seat_winning()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P1"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ResignResponse>())!;
        Assert.Equal(room.GameId, body.GameId);
        Assert.Equal("P2Win", body.Status); // P1 resigned, so P2 wins
        Assert.Equal("Resignation", body.EndReason);

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal("P2Win", game!.Status);
        Assert.Equal("Resignation", game.EndReason);

        var summary = (await client.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == room.GameId);
        Assert.Equal("Resignation", summary.EndReason);

        await using var scope = Scope();
        var row = await Db(scope).Games.AsNoTracking().SingleAsync(g => g.Id == room.GameId);
        Assert.NotNull(row.FinishedAtUtc);
        Assert.Equal("Resignation", row.EndReason);
    }

    [SkippableFact]
    public async Task Resigning_as_P2_makes_P1_the_winner()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P2"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ResignResponse>())!;
        Assert.Equal("P1Win", body.Status);
        Assert.Equal("Resignation", body.EndReason);
    }

    [SkippableFact]
    public async Task A_missing_seat_is_rejected_with_a_400()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsync($"/api/games/{room.GameId}/resign", content: null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("spectators cannot resign", error!.Error);

        var game = await client.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.Equal("InProgress", game!.Status);
    }

    [SkippableFact]
    public async Task An_invalid_seat_is_rejected_with_a_400()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var res = await client.PostAsJsonAsync(
            $"/api/games/{room.GameId}/resign", new ResignRequest("Spectator"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var error = await res.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("spectators cannot resign", error!.Error);
    }

    [SkippableFact]
    public async Task Seat_is_required_and_honoured_even_on_a_non_room_game()
    {
        // The contract calls out seat as "always required — room game or not". A plain
        // POST /api/games game has no JoinCode/seat enforcement anywhere else, but resign must
        // still take the caller's word for which seat they're conceding on behalf of.
        var client = NewClient();
        var created = await client.PostAsync("/api/games", content: null);
        var game = (await created.Content.ReadFromJsonAsync<GameResponse>())!;

        var res = await client.PostAsJsonAsync($"/api/games/{game.Id}/resign", new ResignRequest("P1"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ResignResponse>())!;
        Assert.Equal("P2Win", body.Status);
        Assert.Equal("Resignation", body.EndReason);
    }

    [SkippableFact]
    public async Task Resigning_an_unknown_game_is_404()
    {
        var client = NewClient();

        var res = await client.PostAsJsonAsync($"/api/games/{Guid.NewGuid()}/resign", new ResignRequest("P1"));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task Resigning_an_already_finished_game_is_a_409()
    {
        var client = NewClient();
        var room = await CreateRoomAsync(client);
        await client.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var first = await client.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P1"));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P2"));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var error = await second.Content.ReadFromJsonAsync<MoveError>();
        Assert.Contains("already finished", error!.Error);
    }

    [SkippableFact]
    public async Task A_rated_games_resignation_updates_elo_same_as_an_ordinary_win()
    {
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, p2Auth) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var resign = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/resign", new ResignRequest("P1"));
        Assert.Equal(HttpStatusCode.OK, resign.StatusCode);

        var winner = await p2.GetFromJsonAsync<UserProfile>("/api/auth/me");
        var loser = await p1.GetFromJsonAsync<UserProfile>("/api/auth/me");

        Assert.Equal(p2Auth.User.Id, winner!.Id);
        Assert.True(winner.Rating > 1200);
        Assert.Equal(1, winner.RatedGamesPlayed);

        Assert.Equal(p1Auth.User.Id, loser!.Id);
        Assert.True(loser.Rating < 1200);
        Assert.Equal(1, loser.RatedGamesPlayed);
    }

    private static string UniqueEmail() => $"resign-{Guid.NewGuid():N}@example.com";

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync()
    {
        var client = NewClient();
        var res = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(UniqueEmail(), "correct-horse-1", "Player " + Guid.NewGuid().ToString("N")[..6]));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }
}
