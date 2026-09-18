using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Khet.Contracts;

namespace Khet.Api.Tests.Api;

/// <summary>
/// DB-backed tests of <c>GET /api/games/{id}/players/{seat}</c> — the in-game player-info popup's
/// new opt-in endpoint (backlog/09-player-info-popup.md). Skips (doesn't fail) when no Postgres is
/// reachable, same convention as the rest of <c>Api/</c>.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class PlayerProfileEndpointIntegrationTests(IntegrationFixture fixture)
{
    private static string UniqueEmail() => $"playerprofile-{Guid.NewGuid():N}@example.com";

    private HttpClient NewAnonymousClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync(string? displayName = null)
    {
        var client = NewAnonymousClient();
        var auth = await fixture.RegisterAsync(UniqueEmail(), displayName ?? "Player " + Guid.NewGuid().ToString("N")[..6]);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client)
    {
        var res = await client.PostAsync("/api/rooms", content: null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    [SkippableFact]
    public async Task A_claimed_seats_profile_is_reachable_by_the_seat_the_opponent_and_a_spectator()
    {
        var (p1, _) = await NewAuthedClientAsync("Ada");
        var room = await CreateRoomAsync(p1);
        var (p2, _) = await NewAuthedClientAsync("Bea");
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        var (spectator, _) = await NewAuthedClientAsync("Cleo");

        foreach (var caller in new[] { p1, p2, spectator })
        {
            var res = await caller.GetAsync($"/api/games/{room.GameId}/players/P1");
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            var profile = await res.Content.ReadFromJsonAsync<PublicPlayerProfile>();
            Assert.Equal("Ada", profile!.DisplayName);
            Assert.Equal(0, profile.TotalGamesPlayed);
            Assert.Equal(5, profile.Ratings.Count);
            Assert.All(profile.Ratings, r => Assert.Equal(0, r.Wins + r.Losses));
        }
    }

    [SkippableFact]
    public async Task An_unclaimed_seat_is_404()
    {
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1); // P2 never joins

        var res = await p1.GetAsync($"/api/games/{room.GameId}/players/P2");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task A_bot_seat_is_404()
    {
        var client = NewAuthedClientAsync().GetAwaiter().GetResult().Client;
        var res = await client.PostAsJsonAsync("/api/games/bot", new CreateBotGameRequest("Easy"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = (await res.Content.ReadFromJsonAsync<GameResponse>())!;
        Assert.Equal("P2", game.BotSeat); // default PlayerSeat is P1, so the bot takes P2

        var profileRes = await client.GetAsync($"/api/games/{game.Id}/players/P2");

        Assert.Equal(HttpStatusCode.NotFound, profileRes.StatusCode);
    }

    [SkippableFact]
    public async Task An_unknown_seat_string_is_400()
    {
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);

        var res = await p1.GetAsync($"/api/games/{room.GameId}/players/P3");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [SkippableFact]
    public async Task An_unknown_game_id_is_404()
    {
        var (p1, _) = await NewAuthedClientAsync();

        var res = await p1.GetAsync($"/api/games/{Guid.NewGuid()}/players/P1");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [SkippableFact]
    public async Task Requires_auth()
    {
        var (p1, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var anonymous = NewAnonymousClient();

        var res = await anonymous.GetAsync($"/api/games/{room.GameId}/players/P1");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
