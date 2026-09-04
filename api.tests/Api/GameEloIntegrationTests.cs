using System.Net;
using System.Net.Http.Headers;
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
/// DB-backed tests of the game/account linkage groundwork: threading a user id onto a room seat,
/// deciding <c>Game.Rated</c>, applying Elo on a rated win, seat-claiming, the <c>mine</c> filter,
/// and the leaderboard. Skips when no Postgres is reachable, same convention as the rest of `Api/`.
/// </summary>
[Collection(IntegrationCollection.Name)]
[Trait("Category", "Integration")]
public class GameEloIntegrationTests(IntegrationFixture fixture)
{
    private HttpClient NewClient()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        return fixture.Factory.CreateClient();
    }

    private static string UniqueEmail() => $"elo-{Guid.NewGuid():N}@example.com";

    private async Task<(HttpClient Client, AuthResponse Auth)> NewAuthedClientAsync()
    {
        var client = NewClient();
        var res = await client.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(UniqueEmail(), "correct-horse-1", "Player " + Guid.NewGuid().ToString("N")[..6]));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private static async Task<RoomResponse> CreateRoomAsync(HttpClient client)
    {
        var res = await client.PostAsync("/api/rooms", content: null);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<RoomResponse>())!;
    }

    private KhetDbContext Db(Microsoft.Extensions.DependencyInjection.IServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<KhetDbContext>();

    [SkippableFact]
    public async Task An_anonymous_room_stays_unrated_and_unclaimed()
    {
        var guest = NewClient();
        var room = await CreateRoomAsync(guest);
        await guest.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var game = await guest.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");

        Assert.False(game!.Rated);
        Assert.False(game.P1Claimed);
        Assert.False(game.P2Claimed);
    }

    [SkippableFact]
    public async Task A_room_with_only_one_authenticated_side_stays_unrated()
    {
        var (creator, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(creator);

        var guest = NewClient();
        await guest.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var game = await creator.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.False(game!.Rated);
        Assert.True(game.P1Claimed);
        Assert.False(game.P2Claimed);
    }

    [SkippableFact]
    public async Task A_room_created_and_joined_by_two_accounts_is_rated()
    {
        var (creator, _) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(creator);

        var (joiner, _) = await NewAuthedClientAsync();
        var joinRes = await joiner.PostAsync($"/api/rooms/{room.Code}/join", content: null);
        Assert.Equal(HttpStatusCode.OK, joinRes.StatusCode);

        var game = await creator.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.True(game!.Rated);
        Assert.True(game.P1Claimed);
        Assert.True(game.P2Claimed);
    }

    [SkippableFact]
    public async Task A_rated_games_win_updates_both_players_elo_and_rated_games_played()
    {
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, p2Auth) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        // Seed the same P1-wins-by-rotation position used elsewhere in this test suite.
        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = Db(scope);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }

        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var res = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<SubmitMoveResponse>();
        Assert.Equal("P1Win", body!.Status);

        var winner = await p1.GetFromJsonAsync<UserProfile>("/api/auth/me");
        var loser = await p2.GetFromJsonAsync<UserProfile>("/api/auth/me");

        Assert.Equal(p1Auth.User.Id, winner!.Id);
        Assert.True(winner.Rating > 1200);
        Assert.Equal(1, winner.RatedGamesPlayed);

        Assert.Equal(p2Auth.User.Id, loser!.Id);
        Assert.True(loser.Rating < 1200);
        Assert.Equal(1, loser.RatedGamesPlayed);

        // Row-level check: the game itself is marked Rated, and the summary reflects it.
        var summary = (await p1.GetFromJsonAsync<List<GameSummary>>("/api/games"))!.Single(g => g.Id == room.GameId);
        Assert.True(summary.Rated);
    }

    [SkippableFact]
    public async Task Claim_seat_requires_auth_a_room_game_and_rejects_someone_elses_seat()
    {
        var guest = NewClient();
        var room = await CreateRoomAsync(guest); // anonymous room, P1 unclaimed
        await guest.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        var claimBody = new ClaimSeatRequest("P1");

        // No token at all.
        var anonAttempt = await guest.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.Unauthorized, anonAttempt.StatusCode);

        var (claimer, claimerAuth) = await NewAuthedClientAsync();

        // A non-room game (created via POST /api/games) has no JoinCode.
        var soloRes = await claimer.PostAsync("/api/games", content: null);
        var solo = (await soloRes.Content.ReadFromJsonAsync<GameResponse>())!;
        var nonRoomAttempt = await claimer.PostAsJsonAsync($"/api/games/{solo.Id}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.BadRequest, nonRoomAttempt.StatusCode);

        // Unknown game id.
        var missingAttempt = await claimer.PostAsJsonAsync($"/api/games/{Guid.NewGuid()}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.NotFound, missingAttempt.StatusCode);

        // Unknown seat name.
        var badSeat = await claimer.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", new ClaimSeatRequest("P3"));
        Assert.Equal(HttpStatusCode.BadRequest, badSeat.StatusCode);

        // First claim succeeds and does not retroactively rate the game.
        var firstClaim = await claimer.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.OK, firstClaim.StatusCode);
        var claimResponse = await firstClaim.Content.ReadFromJsonAsync<ClaimSeatResponse>();
        Assert.Equal(room.GameId, claimResponse!.GameId);
        Assert.Equal("P1", claimResponse.Seat);
        Assert.True(claimResponse.Claimed);

        var afterClaim = await claimer.GetFromJsonAsync<GameResponse>($"/api/games/{room.GameId}");
        Assert.True(afterClaim!.P1Claimed);
        Assert.False(afterClaim.Rated); // still unrated — the P2 seat was never authenticated at fill time

        // The same caller claiming again is a no-op success.
        var again = await claimer.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);

        // A different account cannot take an already-claimed seat.
        var (someoneElse, _) = await NewAuthedClientAsync();
        var stolen = await someoneElse.PostAsJsonAsync($"/api/games/{room.GameId}/claim-seat", claimBody);
        Assert.Equal(HttpStatusCode.Conflict, stolen.StatusCode);

        // The claimed game now shows up in the claimer's own archive.
        var mine = await claimer.GetFromJsonAsync<List<GameSummary>>("/api/games?mine=true");
        Assert.Contains(mine!, g => g.Id == room.GameId);

        _ = claimerAuth; // token already consumed via DefaultRequestHeaders
    }

    [SkippableFact]
    public async Task Mine_filter_requires_auth_and_only_returns_the_callers_games()
    {
        var guest = NewClient();
        var anonymousAttempt = await guest.GetAsync("/api/games?mine=true");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousAttempt.StatusCode);

        var (owner, _) = await NewAuthedClientAsync();
        var ownRoom = await CreateRoomAsync(owner);

        var (someoneElse, _) = await NewAuthedClientAsync();
        var otherRoom = await CreateRoomAsync(someoneElse);

        var mine = await owner.GetFromJsonAsync<List<GameSummary>>("/api/games?mine=true");
        Assert.Contains(mine!, g => g.Id == ownRoom.GameId);
        Assert.DoesNotContain(mine!, g => g.Id == otherRoom.GameId);
    }

    [SkippableFact]
    public async Task Leaderboard_only_lists_accounts_with_a_rated_game_and_respects_top()
    {
        var (p1, p1Auth) = await NewAuthedClientAsync();
        var room = await CreateRoomAsync(p1);
        var (p2, _) = await NewAuthedClientAsync();
        await p2.PostAsync($"/api/rooms/{room.Code}/join", content: null);

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = Db(scope);
            var row = await db.Games.SingleAsync(g => g.Id == room.GameId);
            row.State = BoardMapper.ToState(TestBoard.With(
                (new Coord(4, 9), TestBoard.Pyramid(Orientation.NW, Player.P1)),
                (new Coord(4, 5), TestBoard.Pharaoh(Player.P2)),
                (new Coord(7, 0), TestBoard.Pharaoh(Player.P1))));
            row.CurrentTurn = Player.P1;
            await db.SaveChangesAsync();
        }
        var rotate = new SubmitMoveRequest("rotate", new CoordDto(4, 9), null, "CCW");
        var moveRes = await p1.PostAsJsonAsync($"/api/games/{room.GameId}/moves", rotate);
        Assert.Equal(HttpStatusCode.OK, moveRes.StatusCode);

        var (neverPlayed, neverPlayedAuth) = await NewAuthedClientAsync();
        _ = neverPlayed;

        var board = await p1.GetFromJsonAsync<List<LeaderboardEntry>>("/api/leaderboard");
        Assert.Contains(board!, e => e.UserId == p1Auth.User.Id && e.RatedGamesPlayed >= 1);
        Assert.DoesNotContain(board!, e => e.UserId == neverPlayedAuth.User.Id);

        var topOne = await p1.GetFromJsonAsync<List<LeaderboardEntry>>("/api/leaderboard?top=1");
        Assert.True(topOne!.Count <= 1);
    }
}
